// Vercel Serverless Function — /api/stripe-webhook.js
// Handles Stripe webhook events to confirm payments
//
// Configure in Stripe Dashboard → Webhooks → Add endpoint:
// URL: https://yourdomain.com/api/stripe-webhook
// Events: checkout.session.completed

import Stripe from 'stripe';
import admin from 'firebase-admin';

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

// Disable body parsing — Stripe needs raw body for signature verification
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
        console.log(`Booking ${bookingId} confirmed via Stripe`);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).json({ error: err.message });
  }
}
