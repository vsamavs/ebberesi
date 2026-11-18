import crypto from 'crypto';
import { requireAdmin } from './_lib/admin-auth.js';

const MAX_DATA_URI_LENGTH = 4_500_000;

export default async function handler(req, res) {
  try {
    await requireAdmin(req);

    if (req.method === 'GET') {
      const publicId = req.query?.publicId;
      if (typeof publicId !== 'string' || !/^ebberesi\/receipts\/[\w/-]+$/.test(publicId)) return res.status(400).json({ error: 'Documento non valido' });
      const timestamp = Math.floor(Date.now() / 1000) + 300;
      const format = 'jpg';
      const signature = crypto.createHash('sha1').update(`format=${format}&public_id=${publicId}&timestamp=${timestamp}${process.env.CLOUDINARY_SECRET_KEY}`).digest('hex');
      const query = new URLSearchParams({ public_id: publicId, format, timestamp: String(timestamp), api_key: process.env.CLOUDINARY_API_KEY, signature });
      return res.status(200).json({ url: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/download?${query}` });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
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
    return res.status(/autenticazione|autorizzato/i.test(error.message) ? 401 : 500).json({ error: error.message || 'Errore nella gestione dello scontrino' });
  }
}
