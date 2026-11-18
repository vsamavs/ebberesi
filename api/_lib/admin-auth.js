import admin from 'firebase-admin';

export function getAdminDb() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }) });
  }
  return admin;
}

export async function requireAdmin(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Autenticazione mancante');
  const decoded = await getAdminDb().auth().verifyIdToken(token);
  const adminEmail = process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL;
  if (!adminEmail || decoded.email?.toLowerCase() !== adminEmail.toLowerCase()) throw new Error('Accesso non autorizzato');
  return decoded;
}
