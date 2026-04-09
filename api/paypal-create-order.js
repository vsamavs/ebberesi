// Vercel Serverless Function — /api/paypal-create-order.js
// Creates a PayPal order and returns the approval URL

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

// PayPal API base URL — switch to live for production
const PAYPAL_BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function getPayPalAccessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  return data.access_token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { bookingId, amount, eventTitle, qty } = req.body;
    const accessToken = await getPayPalAccessToken();

    const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: bookingId,
            description: `${qty} bigliett${qty > 1 ? 'i' : 'o'} ${eventTitle} — Ebbe Resi`,
            amount: {
              currency_code: 'EUR',
              value: (amount / 100).toFixed(2), // convert cents to EUR
            },
          },
        ],
        application_context: {
          brand_name: 'Ebbe Resi',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: `${req.headers.origin}/?payment=success&booking=${bookingId}&method=paypal`,
          cancel_url: `${req.headers.origin}/?payment=cancelled&booking=${bookingId}`,
        },
      }),
    });

    const order = await orderRes.json();

    // Find the approval URL
    const approvalUrl = order.links?.find(l => l.rel === 'approve')?.href;

    // Update booking
    await db.collection('bookings').doc(bookingId).update({
      paypalOrderId: order.id,
      status: 'pending_payment',
    });

    res.status(200).json({ url: approvalUrl, orderId: order.id });
  } catch (err) {
    console.error('PayPal error:', err);
    res.status(500).json({ error: err.message });
  }
}
