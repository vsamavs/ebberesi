import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, addDoc, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { getAuth, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, onAuthStateChanged, signOut } from 'firebase/auth';

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
// AUTH — Email OTP (Magic Link)
// ============================================================

const actionCodeSettings = {
  // URL where the user lands after clicking the email link
  url: window.location.origin + '/auth-callback',
  handleCodeInApp: true,
};

/** Send a sign-in link to the user's email */
export async function sendLoginLink(email) {
  await sendSignInLinkToEmail(auth, email, actionCodeSettings);
  // Save the email locally so we can complete sign-in after redirect
  window.localStorage.setItem('ebberesi_login_email', email);
}

/** Complete sign-in after user clicks the email link */
export async function completeSignIn() {
  if (isSignInWithEmailLink(auth, window.location.href)) {
    let email = window.localStorage.getItem('ebberesi_login_email');
    if (!email) {
      email = window.prompt('Per completare l\'accesso, inserisci la tua email:');
    }
    const result = await signInWithEmailLink(auth, email, window.location.href);
    window.localStorage.removeItem('ebberesi_login_email');
    return result.user;
  }
  return null;
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
// MEMBERS
// ============================================================

/** Check if a user is a member (has active membership) */
export async function checkMembership(email) {
  const q = query(
    collection(db, 'members'),
    where('email', '==', email),
    where('active', '==', true)
  );
  const snap = await getDocs(q);
  return !snap.empty;
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
