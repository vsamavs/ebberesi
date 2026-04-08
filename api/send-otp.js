// Vercel Serverless Function — /api/send-otp.js
// Generates a 6-digit OTP, stores it in Firestore, sends it via Gmail

import admin from 'firebase-admin';
import nodemailer from 'nodemailer';

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

// Gmail SMTP transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email non valida' });
  }

  try {
    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));

    // Store OTP in Firestore with 10-minute expiry
    await db.collection('otp_codes').doc(email).set({
      code: otp,
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      attempts: 0,
    });

    // Send email
    await transporter.sendMail({
      from: `"Ebbe Resi" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Il tuo codice di accesso — Ebbe Resi',
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-family: Georgia, serif; font-size: 24px; font-weight: 400; color: #1A1715; margin: 0;">
              ebbe<span style="color: #8B2635;">resi</span>
            </h1>
          </div>
          <p style="font-size: 15px; color: #5C5651; line-height: 1.6; margin-bottom: 24px;">
            Ecco il tuo codice di accesso. Inseriscilo sul sito per continuare.
          </p>
          <div style="background: #FAF8F5; border: 1px solid rgba(26,23,21,0.08); border-radius: 12px; padding: 28px; text-align: center; margin-bottom: 24px;">
            <div style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #8B2635;">
              ${otp}
            </div>
          </div>
          <p style="font-size: 13px; color: #9B938B; line-height: 1.5; margin-bottom: 0;">
            Il codice scade tra 10 minuti.<br>
            Se non hai richiesto questo codice, ignora questa email.
          </p>
          <hr style="border: none; border-top: 1px solid rgba(26,23,21,0.08); margin: 32px 0 16px;">
          <p style="font-size: 12px; color: #9B938B; text-align: center;">
            Ebbe Resi — Associazione Culturale di Degustazione
          </p>
        </div>
      `,
    });

    // Check if user exists in Firebase Auth
    let isExistingUser = false;
    try {
      await admin.auth().getUserByEmail(email);
      isExistingUser = true;
    } catch (e) {
      // User doesn't exist yet
      isExistingUser = false;
    }

    res.status(200).json({ success: true, isExistingUser });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: 'Errore nell\'invio del codice' });
  }
}
