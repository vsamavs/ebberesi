// /api/lib/confirm-booking.js
import admin from 'firebase-admin';

export async function confirmBooking(db, bookingId, paymentId) {
  const bookingDoc = await db.collection('bookings').doc(bookingId).get();
  if (!bookingDoc.exists) return;

  const booking = bookingDoc.data();
  if (booking.status === 'paid') return; // già confermata

  // Aggiorna status booking
  await db.collection('bookings').doc(bookingId).update({
    status: 'paid',
    paymentId,
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Solo ora aggiorna i posti occupati sull'evento
  if (booking.eventId) {
    const eventRef = db.collection('events').doc(booking.eventId);
    const eventSnap = await eventRef.get();
    if (eventSnap.exists()) {
      const current = eventSnap.data().bookedSpots || 0;
      await eventRef.update({ bookedSpots: current + (booking.qty || 1) });
    }
  }
}