// Vercel Serverless Function — /api/check-payment-status.js
// Checks booking payment status on Firestore before confirming

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { bookingId } = req.body;
    if (!bookingId) return res.status(400).json({ error: 'bookingId richiesto' });

    const doc = await db.collection('bookings').doc(bookingId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Prenotazione non trovata' });

    const booking = doc.data();
    res.status(200).json({ status: booking.status });
  } catch (err) {
    console.error('Check payment error:', err);
    res.status(500).json({ error: err.message });
  }
}
