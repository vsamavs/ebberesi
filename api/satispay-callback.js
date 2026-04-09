// Vercel Serverless Function — /api/satispay-callback.js
// Called by Satispay when payment status changes

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
      console.log(`Booking ${external_code} confirmed via Satispay`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Satispay callback error:', err);
    res.status(500).json({ error: err.message });
  }
}
