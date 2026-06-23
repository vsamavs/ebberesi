// /api/lib/confirm-booking.js
// Called after payment confirmation — updates booking, reserves spots, syncs to MailerLite

import admin from 'firebase-admin';
import { syncEventSubscriber } from './mailerlite.js';

export async function confirmBooking(db, bookingId, paymentId) {
  const bookingRef = db.collection('bookings').doc(bookingId);
  const bookingDoc = await bookingRef.get();
  if (!bookingDoc.exists) {
    console.warn(`confirmBooking: booking ${bookingId} not found`);
    return;
  }

  const booking = bookingDoc.data();
  if (booking.status === 'paid') {
    console.log(`confirmBooking: booking ${bookingId} already paid, skipping`);
    return;
  }

  // Aggiorna status booking
  await bookingRef.update({
    status: 'paid',
    paymentId,
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Aggiorna i posti occupati sull'evento
  if (booking.eventId) {
    try {
      await db.runTransaction(async (tx) => {
        const eventRef = db.collection('events').doc(booking.eventId);
        const eventSnap = await tx.get(eventRef);
        if (!eventSnap.exists) {
          console.warn(`Event ${booking.eventId} not found`);
          return;
        }
        const current = eventSnap.data().bookedSpots || 0;
        tx.update(eventRef, { bookedSpots: current + (booking.qty || 1) });
      });
      console.log(`Booking ${bookingId} confirmed, ${booking.qty} spots added to event ${booking.eventId}`);
    } catch (err) {
      console.error(`Failed to update bookedSpots for event ${booking.eventId}:`, err);
    }

    // Sync to MailerLite — add subscriber to event group
    try {
      const eventDoc = await db.collection('events').doc(booking.eventId).get();
      const eventTitle = eventDoc.exists ? eventDoc.data().title : booking.eventTitle;

      await syncEventSubscriber({
        email: booking.email,
        name: booking.name,
        surname: booking.surname,
        phone: booking.phone || '',
        eventTitle: eventTitle || 'Evento',
      });
    } catch (mlErr) {
      console.error('MailerLite sync error (event):', mlErr);
    }
  }
}
