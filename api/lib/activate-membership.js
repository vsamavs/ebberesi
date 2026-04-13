// Shared utility — /api/lib/activate-membership.js
// Called after payment is confirmed to activate new memberships or renewals

import admin from 'firebase-admin';

export async function activateMembershipIfNeeded(db, bookingId) {
  const bookingDoc = await db.collection('bookings').doc(bookingId).get();
  if (!bookingDoc.exists) return;

  const booking = bookingDoc.data();

  // Only process if this is a new member signup/renewal and hasn't been activated yet
  if (!booking.isNewMember || booking.membershipActivated) return;

  // Calculate expiry date
  let expiresAt;
  if (booking.isRenewal && booking.renewFromDate) {
    // Renewal: 1 year from the OLD expiry date, not from now
    const oldExpiry = new Date(booking.renewFromDate);
    // If old expiry is in the past, start from now instead
    const startDate = oldExpiry > new Date() ? oldExpiry : new Date();
    expiresAt = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
  } else {
    // New membership: 1 year from now
    expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  }

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
    expiresAt,
    bookingId: bookingId,
  };

  // Create or update member document using email as ID
  await db.collection('members').doc(booking.email).set(memberData, { merge: true });

  // Mark booking as membership activated (prevent double activation)
  await db.collection('bookings').doc(bookingId).update({
    membershipActivated: true,
  });

  const action = booking.isRenewal ? 'renewed' : 'activated';
  console.log(`Membership ${action} for ${booking.email} via booking ${bookingId}, expires ${expiresAt.toISOString()}`);
}
