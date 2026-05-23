// Vercel Serverless Function — /api/satispay-callback.js

import admin from 'firebase-admin';
import { activateMembershipIfNeeded } from './lib/activate-membership.js';
import { sendBookingConfirmation } from './lib/send-confirmation-email.js';
import satispay from 'node-satispay';

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

// const satispay = require('node-satispay');
satispay.config({
  key_id: process.env.SATISPAY_KEY_ID,
  private_key: process.env.SATISPAY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  sandbox: process.env.SATISPAY_MODE !== 'live',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { id } = req.body;

    // Verify payment status directly with Satispay API
    const payment = await satispay.get_payment_details(id);

    if (payment.status === 'ACCEPTED' && payment.external_code) {
      const bookingId = payment.external_code;

      await db.collection('bookings').doc(bookingId).update({
        status: 'paid',
        paymentId: id,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Send booking confirmation email
      const bookingDoc = await db.collection('bookings').doc(bookingId).get();
      const booking = bookingDoc.data();

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
            bookingId,
            eventDate: dateFormatted,
            eventLocation: eventData.location || '',
          });
        } catch (emailErr) {
          console.error('Failed to send booking email:', emailErr);
        }
      }

      // Activate membership if needed
      await activateMembershipIfNeeded(db, bookingId);

      console.log(`Booking ${bookingId} confirmed via Satispay`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Satispay callback error:', err);
    res.status(500).json({ error: err.message });
  }
}