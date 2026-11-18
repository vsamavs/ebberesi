import crypto from 'crypto';
import { requireAdmin } from './_lib/admin-auth.js';

const MAX_DATA_URI_LENGTH = 4_500_000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await requireAdmin(req);
    const { dataUri } = req.body || {};
    if (typeof dataUri !== 'string' || !dataUri.startsWith('data:image/') || dataUri.length > MAX_DATA_URI_LENGTH) return res.status(400).json({ error: 'Immagine non valida o troppo grande' });
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'ebberesi/receipts';
    const signature = crypto.createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${process.env.CLOUDINARY_SECRET_KEY}`).digest('hex');
    const body = new URLSearchParams({ file: dataUri, api_key: process.env.CLOUDINARY_API_KEY, timestamp: String(timestamp), folder, type: 'private', signature });
    const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const result = await cloudinaryResponse.json();
    if (!cloudinaryResponse.ok) throw new Error(result.error?.message || 'Cloudinary ha rifiutato il caricamento');
    return res.status(201).json({ publicId: result.public_id });
  } catch (error) {
    const status = /autenticazione|autorizzato/i.test(error.message) ? 401 : 500;
    return res.status(status).json({ error: error.message || 'Errore durante il caricamento' });
  }
}
