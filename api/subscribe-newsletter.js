// Vercel Serverless Function — /api/subscribe-newsletter.js
// Saves to Firestore AND syncs to MailerLite

import admin from 'firebase-admin';
import { syncNewsletterSubscriber } from './_lib/mailerlite.js';

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
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email richiesta' });

    // Check if already subscribed on Firestore
    const existing = await db.collection('newsletter').where('email', '==', email).limit(1).get();
    const alreadySubscribed = !existing.empty;

    if (!alreadySubscribed) {
      // Save to Firestore
      await db.collection('newsletter').add({
        email,
        subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Sync to MailerLite (idempotent — won't duplicate)
    await syncNewsletterSubscriber(email);

    res.status(200).json({ success: true, alreadySubscribed });
  } catch (err) {
    console.error('Newsletter subscribe error:', err);
    res.status(500).json({ error: err.message });
  }
}
