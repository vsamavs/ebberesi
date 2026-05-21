// Vercel Serverless Function — /api/satispay-callback.js
// Called by Satispay when payment status changes, sends confirmation email

import admin from 'firebase-admin';
import { activateMembershipIfNeeded } from './lib/activate-membership.js';
import { sendBookingConfirmation } from './lib/send-confirmation-email.js';

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
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { id, status, external_code } = req.body;

    if (status === 'ACCEPTED' && external_code) {
      await db.collection('bookings').doc(external_code).update({
        status: 'paid',
        paymentId: id,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Get booking data for email
      const bookingDoc = await db.collection('bookings').doc(external_code).get();
      const booking = bookingDoc.data();

      // Send booking confirmation email
      if (booking && booking.eventId) {
        try {
          const eventDoc = await db.collection('events').doc(booking.eventId).get();
          const eventData = eventDoc.exists ? eventDoc.data() : {};
          const eventDate = eventData.date?.toDate ? eventData.date.toDate() : null;
          const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
          const dateFormatted = eventDate
            ? `${eventDate.getDate()} ${months[eventDate.getMonth()]} ${eventDate.getFullYear()} — ${String(eventDate.getHours()).padStart(2,'0')}:${String(eventDate.getMinutes()).padStart(2,'0')}`
            : '';

          await sendBookingConfirmation({
            ...booking,
            bookingId: external_code,
            eventDate: dateFormatted,
            eventLocation: eventData.location || '',
          });
        } catch (emailErr) {
          console.error('Failed to send booking email:', emailErr);
        }
      }

      // Activate membership if needed
      await activateMembershipIfNeeded(db, external_code);

      console.log(`Booking ${external_code} confirmed via Satispay`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Satispay callback error:', err);
    res.status(500).json({ error: err.message });
  }
}
