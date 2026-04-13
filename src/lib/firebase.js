import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, addDoc, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { getAuth, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';

// Config from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ============================================================
// EVENTS
// ============================================================

/** Fetch all published events, ordered by date ascending */
export async function getEvents() {
  const q = query(
    collection(db, 'events'),
    where('published', '==', true),
    orderBy('date', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Fetch a single event by ID */
export async function getEvent(eventId) {
  const snap = await getDoc(doc(db, 'events', eventId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ============================================================
// BOOKINGS
// ============================================================

/** Create a new booking */
export async function createBooking(bookingData) {
  // bookingData: { eventId, eventTitle, qty, unitPrice, discount, total, name, surname, email, phone, notes, paymentMethod, isMember, createdAt }
  const ref = await addDoc(collection(db, 'bookings'), {
    ...bookingData,
    status: 'pending',
    createdAt: Timestamp.now(),
  });

  // Update booked spots on the event
  const eventRef = doc(db, 'events', bookingData.eventId);
  const eventSnap = await getDoc(eventRef);
  if (eventSnap.exists()) {
    const current = eventSnap.data().bookedSpots || 0;
    await updateDoc(eventRef, { bookedSpots: current + bookingData.qty });
  }

  return ref.id;
}

/** Mark a booking as paid */
export async function confirmBookingPayment(bookingId, paymentId) {
  await updateDoc(doc(db, 'bookings', bookingId), {
    status: 'paid',
    paymentId,
    paidAt: Timestamp.now(),
  });
}

// ============================================================
// NEWSLETTER
// ============================================================

/** Subscribe an email to the newsletter */
export async function subscribeNewsletter(email) {
  // Check if already subscribed
  const q = query(collection(db, 'newsletter'), where('email', '==', email));
  const snap = await getDocs(q);
  if (!snap.empty) return { alreadySubscribed: true };

  await addDoc(collection(db, 'newsletter'), {
    email,
    subscribedAt: Timestamp.now(),
  });
  return { alreadySubscribed: false };
}

// ============================================================
// BLOG
// ============================================================

/** Fetch published blog posts */
export async function getBlogPosts() {
  const q = query(
    collection(db, 'blog'),
    where('published', '==', true),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ============================================================
// AUTH — Email OTP
// ============================================================

/** Send OTP code to email via serverless function */
export async function sendOTP(email) {
  const res = await fetch('/api/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Errore invio OTP');
  return data; // { success, isExistingUser }
}

/** Verify OTP code and sign in */
export async function verifyOTP(email, code) {
  const res = await fetch('/api/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Errore verifica OTP');

  // Sign in with the custom token
  await signInWithCustomToken(auth, data.token);

  return data; // { success, token, isNewUser, hasProfile }
}

/** Listen to auth state changes */
export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/** Sign out */
export async function logout() {
  await signOut(auth);
}

// ============================================================
// USER PROFILES
// ============================================================

/** Get user profile from Firestore */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

/** Create or update user profile */
export async function saveUserProfile(uid, profileData) {
  const { setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'users', uid), {
    ...profileData,
    updatedAt: Timestamp.now(),
  }, { merge: true });
}

/** Check if user profile is complete (has required fields) */
export function isProfileComplete(profile) {
  return profile && profile.name && profile.surname && profile.phone && profile.birthDate;
}

// ============================================================
// MEMBERS
// ============================================================

/** Check if a user is a member and get membership details */
export async function checkMembership(email) {
  const q = query(
    collection(db, 'members'),
    where('email', '==', email),
    where('active', '==', true)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/** Get full membership info including expiry date */
export async function getMembershipInfo(email) {
  const docSnap = await getDoc(doc(db, 'members', email));
  if (!docSnap.exists()) return null;
  const data = docSnap.data();
  const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : (data.expiresAt ? new Date(data.expiresAt) : null);
  const now = new Date();
  const daysUntilExpiry = expiresAt ? Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)) : null;
  return {
    ...data,
    expiresAt,
    daysUntilExpiry,
    isExpiring: daysUntilExpiry !== null && daysUntilExpiry <= 30 && daysUntilExpiry > 0,
    isExpired: daysUntilExpiry !== null && daysUntilExpiry <= 0,
  };
}

/** Create a standalone membership booking (not tied to an event) */
export async function createMembershipBooking(data) {
  const ref = await addDoc(collection(db, 'bookings'), {
    ...data,
    type: 'membership',
    status: 'pending',
    createdAt: Timestamp.now(),
  });
  return ref.id;
}

// ============================================================
// UTILITIES
// ============================================================

/** Format a Firestore Timestamp to a readable Italian date */
export function formatDate(timestamp) {
  if (!timestamp?.toDate) return '';
  const d = timestamp.toDate();
  const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return { full: `${day} ${month} ${year} — ${hours}:${mins}`, day, month, year, time: `${hours}:${mins}` };
}

export { db, auth };
