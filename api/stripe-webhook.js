// Vercel Serverless Function — /api/stripe-webhook.js
// Handles Stripe webhook events to confirm payments and send emails

import Stripe from 'stripe';
import admin from 'firebase-admin';
import { activateMembershipIfNeeded } from './lib/activate-membership.js';
import { sendBookingConfirmation } from './lib/send-confirmation-email.js';
import { confirmBooking } from './lib/confirm-booking.js';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const db = admin.firestore();

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const bookingId = session.metadata?.bookingId;

      if (bookingId) {
        await db.collection('bookings').doc(bookingId).update({
          status: 'paid',
          paymentId: session.payment_intent,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // await confirmBooking(db, bookingId, session.payment_intent);

        // Get booking data for email
        const bookingDoc = await db.collection('bookings').doc(bookingId).get();
        const booking = bookingDoc.data();

        // Send booking confirmation email (only for event bookings, not standalone memberships)
        if (booking && booking.eventId) {
          try {
            // Get event details for the email
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
              eventLocation: eventData.location || booking.eventLocation || '',
            });
          } catch (emailErr) {
            console.error('Failed to send booking email:', emailErr);
          }
        }

        // Activate membership if this booking includes a new member signup
        await activateMembershipIfNeeded(db, bookingId);

        console.log(`Booking ${bookingId} confirmed via Stripe`);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).json({ error: err.message });
  }
}
