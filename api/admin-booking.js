import admin from 'firebase-admin';
import { confirmBooking } from './lib/confirm-booking.js';
import { sendBookingConfirmation, sendAdminBookingNotification } from './lib/send-confirmation-email.js';
import { activateMembershipIfNeeded } from './lib/activate-membership.js';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { bookingId, adminEmail, isPaid } = req.body;

    if (adminEmail !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }

    if (isPaid) {
      // Already paid — confirm booking normally (reserves spots)
      await confirmBooking(db, bookingId, 'cash_' + Date.now());
    } else {
      // Not yet paid — reserve spots but mark as pending
      await db.collection('bookings').doc(bookingId).update({
        status: 'pending_cash',
        paymentMethod: 'cash',
      });

      // Still reserve the spots
      const bookingSnap = await db.collection('bookings').doc(bookingId).get();
      const bookingData = bookingSnap.data();
      if (bookingData && bookingData.eventId) {
        try {
          await db.runTransaction(async (tx) => {
            const eventRef = db.collection('events').doc(bookingData.eventId);
            const eventSnap = await tx.get(eventRef);
            if (eventSnap.exists) {
              const current = eventSnap.data().bookedSpots || 0;
              tx.update(eventRef, { bookedSpots: current + (bookingData.qty || 1) });
            }
          });
        } catch (err) {
          console.error('Failed to update bookedSpots:', err);
        }
      }
    }

    // Get booking data for emails
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    const booking = bookingDoc.data();

    if (booking && booking.eventId) {
      try {
        const eventDoc = await db.collection('events').doc(booking.eventId).get();
        const eventData = eventDoc.exists ? eventDoc.data() : {};
        const eventDate = eventData.date?.toDate ? eventData.date.toDate() : null;
        const dateFormatted = eventDate
          ? eventDate.toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
          : '';

        await sendBookingConfirmation({
          ...booking,
          bookingId,
          eventDate: dateFormatted,
          eventLocation: eventData.location || '',
          isPendingCash: !isPaid,
        });

        await sendAdminBookingNotification({
          ...booking,
          bookingId,
          bookedSpots: eventData.bookedSpots || 0,
          totalSpots: eventData.totalSpots || '?',
          isPendingCash: !isPaid,
        });
      } catch (emailErr) {
        console.error('Failed to send email:', emailErr);
      }
    }

    if (isPaid) {
      await activateMembershipIfNeeded(db, bookingId);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Admin booking error:', err);
    res.status(500).json({ error: err.message });
  }
}