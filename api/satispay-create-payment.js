// Vercel Serverless Function — /api/satispay-create-payment.js

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

const satispay = require('node-satispay');
satispay.config({
  key_id: process.env.SATISPAY_KEY_ID,
  private_key: process.env.SATISPAY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  sandbox: process.env.SATISPAY_MODE !== 'live',
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { bookingId, amount, eventTitle } = req.body;

    const payment = await satispay.create_payment({
      flow: 'MATCH_CODE',
      amount_unit: amount,
      currency: 'EUR',
      description: `${eventTitle} — Ebbere Si`,
      external_code: bookingId,
      callback_url: `${req.headers.origin}/api/satispay-callback`,
      redirect_url: `${req.headers.origin}/?payment=success&booking=${bookingId}&method=satispay`,
    });

    // Update booking
    await db.collection('bookings').doc(bookingId).update({
      satispayPaymentId: payment.id,
      status: 'pending_payment',
    });

    res.status(200).json({
      paymentId: payment.id,
      redirectUrl: payment.redirect_url,
    });
  } catch (err) {
    console.error('Satispay error:', err);
    res.status(500).json({ error: err.message || 'Errore Satispay' });
  }
}