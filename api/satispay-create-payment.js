// Vercel Serverless Function — /api/satispay-create-payment.js
// Creates a Satispay payment and returns the redirect URL
//
// Satispay API docs: https://developers.satispay.com

import admin from 'firebase-admin';
import crypto from 'crypto';

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

// Satispay API base — switch for production
const SATISPAY_BASE = process.env.SATISPAY_MODE === 'live'
  ? 'https://authservices.satispay.com'
  : 'https://staging.authservices.satispay.com';

// Satispay requires signed requests with HMAC
function signRequest(method, url, body, keyId, privateKey) {
  const date = new Date().toUTCString();
  const digest = body
    ? `SHA-256=${crypto.createHash('sha256').update(body).digest('base64')}`
    : '';

  const parsedUrl = new URL(url);
  const signingString = [
    `(request-target): ${method.toLowerCase()} ${parsedUrl.pathname}`,
    `host: ${parsedUrl.host}`,
    `date: ${date}`,
    digest ? `digest: ${digest}` : '',
  ].filter(Boolean).join('\n');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingString);
  const signature = sign.sign(privateKey, 'base64');

  const headers = digest
    ? '(request-target) host date digest'
    : '(request-target) host date';

  return {
    'Host': parsedUrl.host,
    'Date': date,
    'Digest': digest || undefined,
    'Authorization': `Signature keyId="${keyId}", algorithm="rsa-sha256", headers="${headers}", signature="${signature}"`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { bookingId, amount, eventTitle } = req.body;

    const paymentBody = JSON.stringify({
      flow: 'MATCH_CODE',
      amount_unit: amount, // in cents
      currency: 'EUR',
      description: `${eventTitle} — Ebbe Resi`,
      external_code: bookingId,
      callback_url: `${req.headers.origin}/api/satispay-callback`,
      redirect_url: `${req.headers.origin}/?payment=success&booking=${bookingId}&method=satispay`,
    });

    const url = `${SATISPAY_BASE}/g_business/v1/payments`;
    const signedHeaders = signRequest(
      'POST', url, paymentBody,
      process.env.SATISPAY_KEY_ID,
      process.env.SATISPAY_PRIVATE_KEY?.replace(/\\n/g, '\n')
    );

    // Remove undefined headers
    Object.keys(signedHeaders).forEach(k => {
      if (signedHeaders[k] === undefined) delete signedHeaders[k];
    });

    const payRes = await fetch(url, {
      method: 'POST',
      headers: signedHeaders,
      body: paymentBody,
    });

    const payment = await payRes.json();

    if (!payRes.ok) {
      console.error('Satispay API error:', payment);
      return res.status(400).json({ error: payment.message || 'Errore Satispay' });
    }

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
    res.status(500).json({ error: err.message });
  }
}
