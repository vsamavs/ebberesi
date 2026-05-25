// Shared utility — /api/lib/activate-membership.js
// Called after payment is confirmed to activate new memberships or renewals

import admin from 'firebase-admin';
import { sendMembershipConfirmation } from './send-confirmation-email.js';
import { syncMemberSubscriber } from './mailerlite.js';

export async function activateMembershipIfNeeded(db, bookingId) {
  const bookingDoc = await db.collection('bookings').doc(bookingId).get();
  if (!bookingDoc.exists) return;

  const booking = bookingDoc.data();

  // Only process if this is a new member signup/renewal and hasn't been activated yet
  if (!booking.isNewMember || booking.membershipActivated) return;

  // Calculate expiry date
  let expiresAt;
  if (booking.isRenewal && booking.renewFromDate) {
    const oldExpiry = new Date(booking.renewFromDate);
    const startDate = oldExpiry > new Date() ? oldExpiry : new Date();
    expiresAt = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
  } else {
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

  // Create or update member document
  await db.collection('members').doc(booking.email).set(memberData, { merge: true });

  // Mark booking as membership activated
  await db.collection('bookings').doc(bookingId).update({
    membershipActivated: true,
  });

  // Send confirmation email
  try {
    await sendMembershipConfirmation({ ...memberData, expiresAt }, booking.isRenewal || false);
  } catch (emailErr) {
    console.error('Failed to send membership email:', emailErr);
  }

  // Sync to MailerLite — add to "Soci" group
  try {
    await syncMemberSubscriber({
      email: booking.email,
      name: booking.name,
      surname: booking.surname,
      phone: booking.phone || '',
    });
  } catch (mlErr) {
    console.error('MailerLite sync error (membership):', mlErr);
  }

  const action = booking.isRenewal ? 'renewed' : 'activated';
  console.log(`Membership ${action} for ${booking.email} via booking ${bookingId}, expires ${expiresAt.toISOString()}`);
}
