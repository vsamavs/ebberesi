import crypto from 'crypto';
import { requireAdmin } from './_lib/admin-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await requireAdmin(req);
    const publicId = req.query?.publicId;
    if (typeof publicId !== 'string' || !/^ebberesi\/receipts\/[\w/-]+$/.test(publicId)) return res.status(400).json({ error: 'Documento non valido' });
    const timestamp = Math.floor(Date.now() / 1000) + 300;
    const format = 'jpg';
    const signature = crypto.createHash('sha1').update(`format=${format}&public_id=${publicId}&timestamp=${timestamp}${process.env.CLOUDINARY_SECRET_KEY}`).digest('hex');
    const query = new URLSearchParams({ public_id: publicId, format, timestamp: String(timestamp), api_key: process.env.CLOUDINARY_API_KEY, signature });
    const url = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/download?${query}`;
    return res.status(200).json({ url });
  } catch (error) {
    return res.status(/autenticazione|autorizzato/i.test(error.message) ? 401 : 500).json({ error: error.message || 'Documento non disponibile' });
  }
}
