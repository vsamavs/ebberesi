// /api/lib/confirm-booking.js
import admin from 'firebase-admin';

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

  // Aggiorna i posti occupati sull'evento (solo se è una booking di evento)
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
  }
}