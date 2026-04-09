// Shared utility — /api/lib/activate-membership.js
// Called after payment is confirmed to activate new memberships

import admin from 'firebase-admin';

export async function activateMembershipIfNeeded(db, bookingId) {
  const bookingDoc = await db.collection('bookings').doc(bookingId).get();
  if (!bookingDoc.exists) return;

  const booking = bookingDoc.data();

  // Only process if this is a new member signup and hasn't been activated yet
  if (!booking.isNewMember || booking.membershipActivated) return;

  const memberData = {
    email: booking.email,
    name: booking.name,
    surname: booking.surname,
    phone: booking.phone || '',
    address: booking.membershipData?.address || '',
    city: booking.membershipData?.city || '',
    cap: booking.membershipData?.cap || '',
    codiceFiscale: booking.membershipData?.codiceFiscale || '',
    active: true,
    activatedAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
    bookingId: bookingId, // reference to the booking that triggered the signup
  };

  // Create member document using email as ID for easy lookups
  await db.collection('members').doc(booking.email).set(memberData);

  // Mark booking as membership activated (prevent double activation)
  await db.collection('bookings').doc(bookingId).update({
    membershipActivated: true,
  });

  console.log(`Membership activated for ${booking.email} via booking ${bookingId}`);
}
