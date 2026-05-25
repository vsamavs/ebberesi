// Shared utility — /api/lib/send-confirmation-email.js
// Sends confirmation emails after payment for bookings and memberships

import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const BRAND_COLOR = '#8B2635';
const GOLD_COLOR = '#C6A96C';
const BG_COLOR = '#FAF8F5';
const INK_COLOR = '#1A1715';
const INK_SOFT = '#5C5651';
const INK_MUTED = '#9B938B';

function emailWrapper(content) {
  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 0; background: #ffffff;">
      <!-- Header -->
      <div style="background: ${INK_COLOR}; padding: 28px 32px; text-align: center;">
        <h1 style="font-family: Georgia, serif; font-size: 22px; font-weight: 400; color: #ffffff; margin: 0;">
          Ebbere<span style="color: ${BRAND_COLOR};">Si</span>
        </h1>
        <p style="font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: ${INK_MUTED}; margin: 6px 0 0;">Eventi di Degustazione</p>
      </div>
      <!-- Body -->
      <div style="padding: 36px 32px;">
        ${content}
      </div>
      <!-- Footer -->
      <div style="border-top: 1px solid #eee; padding: 24px 32px; text-align: center;">
        <p style="font-size: 12px; color: ${INK_MUTED}; margin: 0 0 8px;">Ebbere Si — Associazione Culturale di Degustazione</p>
        <p style="font-size: 11px; color: ${INK_MUTED}; margin: 0;">
          <a href="https://ebberesi.it" style="color: ${BRAND_COLOR}; text-decoration: none;">ebberesi.it</a>
        </p>
      </div>
    </div>
  `;
}

/**
 * Send booking confirmation email
 */
export async function sendBookingConfirmation(booking) {
  const discountLine = booking.discount > 0
    ? `<tr><td style="padding:8px 0;font-size:14px;color:#2E7D32">Sconto socio (−15%)</td><td style="padding:8px 0;font-size:14px;color:#2E7D32;text-align:right">−€${booking.discount.toFixed(2).replace('.', ',')}</td></tr>`
    : '';

  const memberFeeLine = booking.memberFee > 0
    ? `<tr><td style="padding:8px 0;font-size:14px;color:${INK_SOFT}">Tesseramento socio</td><td style="padding:8px 0;font-size:14px;color:${INK_SOFT};text-align:right">€10,00</td></tr>`
    : '';

  const content = `
    <!-- Checkmark -->
    <div style="text-align:center;margin-bottom:24px">
      <svg width="56" height="56" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" style="display:inline-block">
        <circle cx="28" cy="28" r="28" fill="rgba(46,125,50,0.1)"/>
        <path d="M18 28l7 7 13-13" fill="none" stroke="#2E7D32" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>

    <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:400;text-align:center;color:${INK_COLOR};margin:0 0 8px">Prenotazione confermata!</h2>
    <p style="font-size:14px;color:${INK_SOFT};text-align:center;margin:0 0 28px">Grazie ${booking.name}, ecco i dettagli della tua prenotazione.</p>

    <!-- Event Card -->
    <div style="background:${BG_COLOR};border-radius:12px;padding:24px;margin-bottom:24px">
      <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${BRAND_COLOR};margin:0 0 8px">Evento</p>
      <h3 style="font-family:Georgia,serif;font-size:18px;font-weight:500;color:${INK_COLOR};margin:0 0 12px">${booking.eventTitle}</h3>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${INK_MUTED}">📅 Data</td>
          <td style="padding:4px 0;font-size:13px;color:${INK_COLOR};text-align:right">${booking.eventDate || ''}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${INK_MUTED}">📍 Luogo</td>
          <td style="padding:4px 0;font-size:13px;color:${INK_COLOR};text-align:right">${booking.eventLocation || ''}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${INK_MUTED}">👤 Intestato a</td>
          <td style="padding:4px 0;font-size:13px;color:${INK_COLOR};text-align:right">${booking.name} ${booking.surname}</td>
        </tr>
      </table>
    </div>

    <!-- Order Summary -->
    <div style="margin-bottom:24px">
      <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${INK_MUTED};margin:0 0 12px">Riepilogo ordine</p>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:8px 0;font-size:14px;color:${INK_SOFT}">${booking.qty}× Biglietto</td>
          <td style="padding:8px 0;font-size:14px;color:${INK_SOFT};text-align:right">€${(booking.qty * booking.unitPrice).toFixed(2).replace('.', ',')}</td>
        </tr>
        ${discountLine}
        ${memberFeeLine}
        <tr style="border-top:2px solid #eee">
          <td style="padding:12px 0 0;font-size:16px;font-weight:500;color:${INK_COLOR}">Totale pagato</td>
          <td style="padding:12px 0 0;font-size:18px;font-weight:500;color:${BRAND_COLOR};text-align:right;font-family:Georgia,serif">€${booking.total.toFixed(2).replace('.', ',')}</td>
        </tr>
      </table>
    </div>

    <!-- Booking ID -->
    <div style="background:${BG_COLOR};border-radius:8px;padding:14px 18px;text-align:center;margin-bottom:24px">
      <p style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${INK_MUTED};margin:0 0 4px">Codice prenotazione</p>
      <p style="font-family:'Courier New',monospace;font-size:14px;font-weight:600;color:${INK_COLOR};margin:0;letter-spacing:1px">${booking.bookingId}</p>
    </div>

    <p style="font-size:13px;color:${INK_MUTED};text-align:center;line-height:1.6;margin:0">
      Ti aspettiamo! Per qualsiasi domanda scrivi a<br>
      <a href="mailto:info@ebberesi.it" style="color:${BRAND_COLOR};text-decoration:none">info@ebberesi.it</a>
    </p>
  `;

  await transporter.sendMail({
    from: `"Ebbere Si" <${process.env.GMAIL_USER_ALIAS}>`,
    to: booking.email,
    subject: `Prenotazione confermata — ${booking.eventTitle}`,
    html: emailWrapper(content),
  });

  console.log(`Booking confirmation email sent to ${booking.email}`);
}

/**
 * Send membership confirmation email
 */
export async function sendMembershipConfirmation(memberData, isRenewal = false) {
  const expiresAt = memberData.expiresAt instanceof Date
    ? memberData.expiresAt
    : new Date(memberData.expiresAt);

  const months = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  const expiryFormatted = `${expiresAt.getDate()} ${months[expiresAt.getMonth()]} ${expiresAt.getFullYear()}`;

  const title = isRenewal ? 'Tessera rinnovata!' : 'Benvenuto nel club!';
  const subtitle = isRenewal
    ? `${memberData.name}, la tua tessera socio è stata rinnovata con successo.`
    : `${memberData.name}, sei ufficialmente socio Ebbere Si!`;

  const content = `
    <!-- Icon -->
    <div style="text-align:center;margin-bottom:24px">
      <div style="width:56px;height:56px;border-radius:50%;background:rgba(198,169,108,0.15);display:inline-flex;align-items:center;justify-content:center;font-size:28px">🍷</div>
    </div>

    <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:400;text-align:center;color:${INK_COLOR};margin:0 0 8px">${title}</h2>
    <p style="font-size:14px;color:${INK_SOFT};text-align:center;margin:0 0 28px">${subtitle}</p>

    <!-- Membership Card -->
    <div style="background:${INK_COLOR};border-radius:12px;padding:28px;text-align:center;margin-bottom:24px">
      <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${GOLD_COLOR};margin:0 0 8px">Tessera Socio</p>
      <h3 style="font-family:Georgia,serif;font-size:20px;font-weight:400;color:#ffffff;margin:0 0 4px">${memberData.name} ${memberData.surname}</h3>
      <p style="font-size:13px;color:${INK_MUTED};margin:0 0 16px">${memberData.email}</p>
      <div style="width:40px;height:1px;background:${GOLD_COLOR};margin:0 auto 16px;opacity:0.3"></div>
      <p style="font-size:12px;color:rgba(250,248,245,0.6);margin:0">Valida fino al</p>
      <p style="font-size:16px;color:#ffffff;font-weight:500;margin:4px 0 0">${expiryFormatted}</p>
    </div>

    <!-- Benefits -->
    <div style="background:${BG_COLOR};border-radius:12px;padding:24px;margin-bottom:24px">
      <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${INK_MUTED};margin:0 0 14px">I tuoi vantaggi</p>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:8px 0;font-size:14px;color:${INK_COLOR};vertical-align:top;width:28px">%</td>
          <td style="padding:8px 0;font-size:14px;color:${INK_SOFT}"><strong style="color:${INK_COLOR}">15% di sconto</strong> su un biglietto per ogni evento</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:14px;color:${INK_COLOR};vertical-align:top">★</td>
          <td style="padding:8px 0;font-size:14px;color:${INK_SOFT}"><strong style="color:${INK_COLOR}">Accesso prioritario</strong> alla prenotazione</td>
        </tr>
      </table>
    </div>

    <p style="font-size:13px;color:${INK_MUTED};text-align:center;line-height:1.6;margin:0">
      Per qualsiasi domanda scrivi a<br>
      <a href="mailto:info@ebberesi.it" style="color:${BRAND_COLOR};text-decoration:none">info@ebberesi.it</a>
    </p>
  `;

  await transporter.sendMail({
    from: `"Ebbere Si" <${process.env.GMAIL_USER_ALIAS}>`,
    to: memberData.email,
    subject: isRenewal ? 'Tessera rinnovata — Ebbere Si' : 'Benvenuto in Ebbere Si!',
    html: emailWrapper(content),
  });

  console.log(`Membership ${isRenewal ? 'renewal' : 'activation'} email sent to ${memberData.email}`);
}
