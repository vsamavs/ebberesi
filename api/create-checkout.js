// Vercel Serverless Function — /api/create-checkout.js
// Creates a Stripe Checkout session and returns the URL
//
// Requires STRIPE_SECRET_KEY in Vercel environment variables
// Install: npm install stripe (already in package.json)

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { bookingId, amount, eventTitle, qty } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: eventTitle,
              description: `${qty} bigliett${qty > 1 ? 'i' : 'o'} — Ebbe Resi`,
            },
            unit_amount: amount, // in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.origin}/success?booking=${bookingId}`,
      cancel_url: `${req.headers.origin}/#eventi`,
      metadata: {
        bookingId,
      },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
}
