// Vercel Serverless Function — /api/verify-otp.js
// Verifies the OTP code and returns a Firebase Custom Token for sign-in

import admin from 'firebase-admin';

// Initialize Firebase Admin (singleton)
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
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Email e codice richiesti' });
  }

  try {
    // Get stored OTP
    const otpDoc = await db.collection('otp_codes').doc(email).get();

    if (!otpDoc.exists) {
      return res.status(400).json({ error: 'Codice non trovato. Richiedi un nuovo codice.' });
    }

    const otpData = otpDoc.data();

    // Check max attempts (prevent brute force)
    if (otpData.attempts >= 5) {
      await db.collection('otp_codes').doc(email).delete();
      return res.status(400).json({ error: 'Troppi tentativi. Richiedi un nuovo codice.' });
    }

    // Check expiry
    const expiresAt = otpData.expiresAt?.toDate ? otpData.expiresAt.toDate() : new Date(otpData.expiresAt);
    if (new Date() > expiresAt) {
      await db.collection('otp_codes').doc(email).delete();
      return res.status(400).json({ error: 'Codice scaduto. Richiedi un nuovo codice.' });
    }

    // Check code
    if (otpData.code !== code.trim()) {
      // Increment attempts
      await db.collection('otp_codes').doc(email).update({
        attempts: admin.firestore.FieldValue.increment(1),
      });
      return res.status(400).json({ error: 'Codice errato. Riprova.' });
    }

    // OTP is valid — delete it
    await db.collection('otp_codes').doc(email).delete();

    // Get or create Firebase Auth user
    let uid;
    let isNewUser = false;
    try {
      const existingUser = await admin.auth().getUserByEmail(email);
      uid = existingUser.uid;
    } catch (e) {
      // Create new user
      const newUser = await admin.auth().createUser({ email });
      uid = newUser.uid;
      isNewUser = true;
    }

    // Create custom token for client sign-in
    const customToken = await admin.auth().createCustomToken(uid);

    // Check if user has a profile
    const profileDoc = await db.collection('users').doc(uid).get();
    const hasProfile = profileDoc.exists && profileDoc.data()?.name && profileDoc.data()?.surname;

    res.status(200).json({
      success: true,
      token: customToken,
      isNewUser,
      hasProfile,
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Errore nella verifica del codice' });
  }
}
