import { getEvents, createBooking, subscribeNewsletter, formatDate, getBlogPosts, sendOTP, verifyOTP, onAuth, logout, checkMembership, getUserProfile, saveUserProfile, isProfileComplete } from './lib/firebase.js';
import './styles/globals.css';

// ===================================================================
// STATE
// ===================================================================
let events = [];
let blogPosts = [];
let currentStep = 1, qty = 0, isMember = false, selectedPayment = null;
let currentEvent = null;
let currentUser = null;

// ===================================================================
// INIT
// ===================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  initScrollReveal();
  initAuth();
  await loadEvents();
  await loadBlog();
  initNewsletterForm();
});

// ===================================================================
// LOAD EVENTS FROM FIREBASE
// ===================================================================
async function loadEvents() {
  const grid = document.getElementById('eventsGrid');

  // Show skeletons while loading
  grid.innerHTML = `
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
  `;

  try {
    events = await getEvents();
    renderEvents(events);
  } catch (err) {
    console.error('Errore caricamento eventi:', err);
    grid.innerHTML = `<p style="color:var(--ink-muted);font-size:0.9rem;">Impossibile caricare gli eventi. Riprova più tardi.</p>`;
  }
}

function renderEvents(events) {
  const grid = document.getElementById('eventsGrid');

  if (events.length === 0) {
    grid.innerHTML = `<p style="color:var(--ink-muted);font-size:0.9rem;">Nessun evento in programma al momento. Torna presto!</p>`;
    return;
  }

  grid.innerHTML = events.map(ev => {
    const d = formatDate(ev.date);
    const spotsLeft = (ev.totalSpots || 30) - (ev.bookedSpots || 0);
    const memberPrice = (ev.price * 0.85).toFixed(2).replace('.', ',');

    let statusClass = 'available', statusText = 'Disponibile';
    if (spotsLeft <= 0) { statusClass = 'soldout'; statusText = 'Esaurito'; }
    else if (spotsLeft <= 8) { statusClass = 'few'; statusText = 'Ultimi Posti'; }

    return `
      <div class="event-card reveal" data-event-id="${ev.id}">
        <div class="event-img"${ev.image ? ` style="background:url('${ev.image}') center/cover no-repeat"` : ''}>
          ${ev.image ? '' : `<div class="event-img-overlay">${ev.emoji || '🍷'}</div>`}
          <div class="event-date-badge">
            <div class="day">${d.day}</div>
            <div class="month">${d.month}</div>
          </div>
          <span class="event-status ${statusClass}">${statusText}</span>
        </div>
        <div class="event-body">
          <h3>${ev.title}</h3>
          <div class="event-meta">
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              ${d.time}
            </span>
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              ${ev.location}
            </span>
          </div>
          <p>${ev.description || ''}</p>
          <div class="event-footer">
            <div class="event-price">
              €${ev.price}
              <span class="member-price">Soci: €${memberPrice}</span>
            </div>
            ${spotsLeft > 0
              ? `<button class="btn-book" onclick="window.openBooking('${ev.id}')">Prenota</button>`
              : `<button class="btn-book" disabled style="opacity:0.4;cursor:default">Esaurito</button>`
            }
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Re-observe new reveal elements
  document.querySelectorAll('.events-grid .reveal').forEach(el => revealObserver.observe(el));
}

// ===================================================================
// LOAD BLOG FROM FIREBASE
// ===================================================================
async function loadBlog() {
  const grid = document.getElementById('blogGrid');
  if (!grid) return;

  try {
    blogPosts = await getBlogPosts();
    if (blogPosts.length === 0) return;

    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    grid.innerHTML = blogPosts.slice(0, 3).map((post, i) => {
      const d = formatDate(post.date);
      return `
        <article class="blog-card reveal">
          <div class="blog-thumb-wrap">
            <div class="blog-thumb"><div class="blog-thumb-icon">${romanNumerals[i] || (i+1)}</div></div>
          </div>
          <div class="blog-category">${post.category || 'Articolo'}</div>
          <h3>${post.title}</h3>
          <p>${post.excerpt || ''}</p>
          <div class="blog-date">${d.day} ${d.month} ${d.year}</div>
        </article>
      `;
    }).join('');

    grid.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
  } catch (err) {
    console.error('Errore caricamento blog:', err);
  }
}

// ===================================================================
// BOOKING MODAL
// ===================================================================
window.openBooking = function (eventId) {
  currentEvent = events.find(e => e.id === eventId);
  if (!currentEvent) return;

  const spotsLeft = (currentEvent.totalSpots || 30) - (currentEvent.bookedSpots || 0);
  currentEvent._spotsLeft = spotsLeft;

  qty = 0; isMember = false; selectedPayment = null; currentStep = 1;

  // Reset UI
  document.getElementById('memberSwitch').classList.remove('on');
  document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('btnPay').disabled = true;
  document.getElementById('btnPay').textContent = 'Scegli un metodo';
  ['fieldNome','fieldCognome','fieldEmail','fieldTelefono','fieldNote'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('error'); }
  });
  document.querySelectorAll('.form-error').forEach(e => e.classList.remove('show'));

  // Populate header
  const d = formatDate(currentEvent.date);
  document.getElementById('modalTitle').textContent = currentEvent.title;
  document.getElementById('modalDate').textContent = d.full;
  document.getElementById('modalLocation').textContent = currentEvent.location;
  document.getElementById('ticketPriceLabel').textContent = fmt(currentEvent.price) + ' a persona';

  document.getElementById('stepsBar').style.display = '';
  document.getElementById('stepLabels').style.display = '';
  updateQtyUI();
  goStep(1);

  document.getElementById('bookingModal').classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeBooking = function () {
  document.getElementById('bookingModal').classList.remove('active');
  document.body.style.overflow = '';
};

// Close on overlay / Escape
document.getElementById('bookingModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) window.closeBooking();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') window.closeBooking(); });

// ===================================================================
// STEPS
// ===================================================================
window.goStep = function (step) {
  currentStep = step;
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`[data-panel="${step}"]`).classList.add('active');

  document.querySelectorAll('.step-dot').forEach(d => {
    const s = +d.dataset.step;
    d.className = 'step-dot';
    if (s === step) d.classList.add('active');
    else if (s < step) d.classList.add('done');
  });
  document.querySelectorAll('.step-label').forEach((l, i) => {
    l.className = 'step-label';
    if (i + 1 === step) l.classList.add('active');
    else if (i + 1 < step) l.classList.add('done');
  });

  if (step === 3) populateRecap();
  if (step === 4) {
    document.getElementById('stepsBar').style.display = 'none';
    document.getElementById('stepLabels').style.display = 'none';
  }
};

// ===================================================================
// QTY
// ===================================================================
window.changeQty = function (delta) {
  if (!currentEvent) return;
  qty = Math.max(0, Math.min(qty + delta, currentEvent._spotsLeft || 10));
  updateQtyUI();
};

function updateQtyUI() {
  document.getElementById('qtyNum').textContent = qty;
  document.getElementById('qtyMinus').disabled = qty <= 0;
  document.getElementById('qtyPlus').disabled = qty >= (currentEvent?._spotsLeft || 10);
  document.getElementById('btnStep1Next').disabled = qty === 0;

  const s = document.getElementById('orderSummary');
  if (qty > 0 && currentEvent) {
    s.style.display = 'block';
    const sub = qty * currentEvent.price;
    const disc = isMember ? sub * 0.15 : 0;
    document.getElementById('summaryQtyLabel').textContent = `${qty}\u00D7 Biglietto`;
    document.getElementById('summarySubtotal').textContent = fmt(sub);
    document.getElementById('summaryDiscountRow').style.display = isMember ? 'flex' : 'none';
    document.getElementById('summaryDiscount').textContent = '\u2212' + fmt(disc);
    document.getElementById('summaryTotal').textContent = fmt(sub - disc);
  } else {
    s.style.display = 'none';
  }
}

window.toggleMember = function () {
  isMember = !isMember;
  document.getElementById('memberSwitch').classList.toggle('on', isMember);
  updateQtyUI();
};

// ===================================================================
// FORM VALIDATION
// ===================================================================
window.validateAndGoStep3 = function () {
  let ok = true;
  const fields = [
    { id: 'fieldNome', err: 'errNome', test: v => v.trim().length >= 2 },
    { id: 'fieldCognome', err: 'errCognome', test: v => v.trim().length >= 2 },
    { id: 'fieldEmail', err: 'errEmail', test: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
    { id: 'fieldTelefono', err: 'errTelefono', test: v => v.replace(/\s/g, '').length >= 8 },
  ];
  fields.forEach(f => {
    const inp = document.getElementById(f.id);
    const err = document.getElementById(f.err);
    if (!f.test(inp.value)) { inp.classList.add('error'); err.classList.add('show'); ok = false; }
    else { inp.classList.remove('error'); err.classList.remove('show'); }
  });
  if (ok) window.goStep(3);
};

// ===================================================================
// PAYMENT RECAP
// ===================================================================
function populateRecap() {
  if (!currentEvent) return;
  const sub = qty * currentEvent.price;
  const disc = isMember ? sub * 0.15 : 0;
  const d = formatDate(currentEvent.date);

  document.getElementById('recapEvent').textContent = currentEvent.title;
  document.getElementById('recapDate').textContent = d.full;
  document.getElementById('recapQty').textContent = `${qty}\u00D7 Biglietto`;
  document.getElementById('recapSubtotal').textContent = fmt(sub);
  document.getElementById('recapDiscountRow').style.display = isMember ? 'flex' : 'none';
  document.getElementById('recapDiscount').textContent = '\u2212' + fmt(disc);
  document.getElementById('recapName').textContent =
    document.getElementById('fieldNome').value + ' ' + document.getElementById('fieldCognome').value;
  document.getElementById('recapTotal').textContent = fmt(sub - disc);
}

// ===================================================================
// PAYMENT
// ===================================================================
window.selectPayment = function (method) {
  selectedPayment = method;
  document.querySelectorAll('.payment-option').forEach(o =>
    o.classList.toggle('selected', o.dataset.method === method)
  );
  document.getElementById('btnPay').disabled = false;
  const labels = { stripe: 'Paga con carta', paypal: 'Paga con PayPal', satispay: 'Paga con Satispay' };
  document.getElementById('btnPay').textContent = labels[method];
};

window.processPayment = async function () {
  if (!currentEvent || !selectedPayment) return;
  const btn = document.getElementById('btnPay');
  btn.disabled = true;
  btn.textContent = 'Elaborazione\u2026';

  const sub = qty * currentEvent.price;
  const disc = isMember ? sub * 0.15 : 0;
  const total = sub - disc;

  try {
    // Save booking to Firestore
    const bookingId = await createBooking({
      eventId: currentEvent.id,
      eventTitle: currentEvent.title,
      qty,
      unitPrice: currentEvent.price,
      discount: disc,
      total,
      name: document.getElementById('fieldNome').value.trim(),
      surname: document.getElementById('fieldCognome').value.trim(),
      email: document.getElementById('fieldEmail').value.trim(),
      phone: document.getElementById('fieldTelefono').value.trim(),
      notes: document.getElementById('fieldNote').value.trim(),
      paymentMethod: selectedPayment,
      isMember,
    });

    // Redirect to payment provider
    if (selectedPayment === 'stripe') {
      // Call Vercel serverless function to create Stripe Checkout session
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, amount: Math.round(total * 100), eventTitle: currentEvent.title, qty }),
      });
      const { url } = await res.json();
      if (url) { window.location.href = url; return; }
    }

    if (selectedPayment === 'paypal') {
      // PayPal integration — redirect to PayPal checkout
      // In production: create order via PayPal API and redirect
      showToast('Reindirizzamento a PayPal...', 'success');
    }

    if (selectedPayment === 'satispay') {
      // Satispay integration — open Satispay payment
      // In production: create payment via Satispay API
      showToast('Apri Satispay per completare il pagamento', 'success');
    }

    // For demo/fallback: show confirmation
    document.getElementById('confirmEmail').textContent = document.getElementById('fieldEmail').value;
    window.goStep(4);

  } catch (err) {
    console.error('Errore pagamento:', err);
    showToast('Errore durante il pagamento. Riprova.', 'error');
    btn.disabled = false;
    btn.textContent = 'Riprova';
  }
};

// ===================================================================
// NEWSLETTER
// ===================================================================
function initNewsletterForm() {
  const btn = document.getElementById('newsletterBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const input = document.getElementById('newsletterEmail');
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('Inserisci un indirizzo email valido.', 'error');
      return;
    }
    try {
      const result = await subscribeNewsletter(email);
      if (result.alreadySubscribed) {
        showToast('Sei già iscritto alla newsletter!', 'success');
      } else {
        showToast('Iscritto! Grazie.', 'success');
      }
      input.value = '';
    } catch (err) {
      showToast('Errore. Riprova più tardi.', 'error');
    }
  });
}

// ===================================================================
// NAV
// ===================================================================
function initNav() {
  window.addEventListener('scroll', () =>
    document.getElementById('nav').classList.toggle('scrolled', scrollY > 20)
  );
  document.getElementById('navToggle')?.addEventListener('click', () =>
    document.getElementById('navLinks').classList.toggle('open')
  );
  document.querySelectorAll('.nav-links a').forEach(a =>
    a.addEventListener('click', () => document.getElementById('navLinks').classList.remove('open'))
  );
}

// ===================================================================
// SCROLL REVEAL
// ===================================================================
let revealObserver;
function initScrollReveal() {
  revealObserver = new IntersectionObserver(entries => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('visible'), i * 80);
        revealObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
}

// ===================================================================
// UTILITIES
// ===================================================================
function fmt(n) { return '\u20AC' + n.toFixed(2).replace('.', ','); }

function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ===================================================================
// AUTH
// ===================================================================
let userProfile = null;
let pendingEmail = '';

async function initAuth() {
  onAuth(async (user) => {
    currentUser = user;
    userProfile = null;

    if (user) {
      try {
        userProfile = await getUserProfile(user.uid);
      } catch (e) { console.error('Profile load error:', e); }

      if (!isProfileComplete(userProfile)) {
        updateAuthUI(user);
        showProfileCompletion();
        return;
      }

      try {
        const memberStatus = await checkMembership(user.email);
        if (memberStatus) {
          document.getElementById('authMemberBadge').style.display = '';
        }
      } catch (e) { /* ignore */ }
    }

    updateAuthUI(user);
  });
}

function updateAuthUI(user) {
  const btn = document.getElementById('navAuthBtn');
  if (!btn) return;
  if (user) {
    const initials = userProfile && userProfile.name && userProfile.surname
      ? (userProfile.name[0] + userProfile.surname[0]).toUpperCase()
      : getInitials(user.email);
    btn.className = 'nav-auth-avatar';
    btn.textContent = initials;
    btn.title = userProfile ? `${userProfile.name} ${userProfile.surname}` : user.email;
  } else {
    btn.className = 'nav-auth';
    btn.textContent = 'Accedi';
    btn.title = '';
  }
}

function getInitials(email) {
  if (!email) return '?';
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function showProfileCompletion() {
  hideAllAuthSteps();
  document.getElementById('authStepProfile').style.display = 'block';
  document.getElementById('authModalTitle').textContent = 'Completa il profilo';
  document.getElementById('authModalDesc').textContent = 'Ancora un ultimo passaggio per completare la registrazione.';
  document.getElementById('authModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function hideAllAuthSteps() {
  ['authStepEmail', 'authStepOtp', 'authStepProfile', 'authStepLoggedIn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

window.openAuthModal = function () {
  hideAllAuthSteps();
  if (currentUser) {
    if (!isProfileComplete(userProfile)) { showProfileCompletion(); return; }
    document.getElementById('authStepLoggedIn').style.display = 'block';
    document.getElementById('authModalTitle').textContent = 'Il tuo profilo';
    document.getElementById('authModalDesc').textContent = '';
    const initials = userProfile
      ? (userProfile.name[0] + userProfile.surname[0]).toUpperCase()
      : getInitials(currentUser.email);
    document.getElementById('authAvatar').textContent = initials;
    document.getElementById('authUserEmail').textContent = currentUser.email;
    if (userProfile) document.getElementById('authUserName').textContent = `${userProfile.name} ${userProfile.surname}`;
  } else {
    document.getElementById('authStepEmail').style.display = 'block';
    document.getElementById('authModalTitle').textContent = 'Accedi o registrati';
    document.getElementById('authModalDesc').textContent = 'Inserisci la tua email per ricevere un codice di accesso.';
    document.getElementById('authEmail').value = '';
    document.getElementById('authEmailErr').classList.remove('show');
    document.getElementById('authEmail').classList.remove('error');
  }
  document.getElementById('authModal').classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeAuthModal = function () {
  document.getElementById('authModal').classList.remove('active');
  document.body.style.overflow = '';
};

document.getElementById('authModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) window.closeAuthModal();
});

window.handleSendOtp = async function () {
  const input = document.getElementById('authEmail');
  const email = input.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    input.classList.add('error');
    document.getElementById('authEmailErr').classList.add('show');
    return;
  }
  input.classList.remove('error');
  document.getElementById('authEmailErr').classList.remove('show');
  const btn = document.getElementById('btnSendOtp');
  btn.disabled = true;
  btn.textContent = 'Invio in corso\u2026';
  try {
    await sendOTP(email);
    pendingEmail = email;
    hideAllAuthSteps();
    document.getElementById('authStepOtp').style.display = 'block';
    document.getElementById('otpSentEmail').textContent = email;
    document.getElementById('authModalTitle').textContent = 'Inserisci il codice';
    document.getElementById('authModalDesc').textContent = '';
    document.getElementById('authOtpCode').value = '';
    document.getElementById('authOtpErr').classList.remove('show');
    document.getElementById('authOtpCode').focus();
  } catch (err) {
    console.error('Send OTP error:', err);
    showToast(err.message || 'Errore nell\'invio del codice', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Invia codice';
  }
};

window.handleVerifyOtp = async function () {
  const code = document.getElementById('authOtpCode').value.trim();
  if (!/^\d{6}$/.test(code)) {
    document.getElementById('authOtpCode').classList.add('error');
    document.getElementById('authOtpErr').classList.add('show');
    document.getElementById('authOtpErr').textContent = 'Inserisci un codice a 6 cifre';
    return;
  }
  document.getElementById('authOtpCode').classList.remove('error');
  document.getElementById('authOtpErr').classList.remove('show');
  const btn = document.getElementById('btnVerifyOtp');
  btn.disabled = true;
  btn.textContent = 'Verifica\u2026';
  try {
    const result = await verifyOTP(pendingEmail, code);
    if (result.hasProfile) {
      showToast('Accesso effettuato!', 'success');
      window.closeAuthModal();
    }
  } catch (err) {
    console.error('Verify OTP error:', err);
    document.getElementById('authOtpCode').classList.add('error');
    document.getElementById('authOtpErr').classList.add('show');
    document.getElementById('authOtpErr').textContent = err.message || 'Codice non valido';
    btn.disabled = false;
    btn.textContent = 'Verifica';
  }
};

window.handleBackToEmail = function () {
  hideAllAuthSteps();
  document.getElementById('authStepEmail').style.display = 'block';
  document.getElementById('authModalTitle').textContent = 'Accedi o registrati';
  document.getElementById('authModalDesc').textContent = 'Inserisci la tua email per ricevere un codice di accesso.';
};

window.handleResendOtp = async function () {
  if (!pendingEmail) return;
  try {
    await sendOTP(pendingEmail);
    showToast('Nuovo codice inviato!', 'success');
  } catch (err) {
    showToast(err.message || 'Errore nel reinvio', 'error');
  }
};

window.handleSaveProfile = async function () {
  let ok = true;
  const fields = [
    { id: 'profileNome', err: 'errProfileNome', test: v => v.trim().length >= 2 },
    { id: 'profileCognome', err: 'errProfileCognome', test: v => v.trim().length >= 2 },
    { id: 'profileTelefono', err: 'errProfileTelefono', test: v => v.replace(/\s/g, '').length >= 8 },
    { id: 'profileBirthDate', err: 'errProfileBirthDate', test: v => v.length > 0 },
  ];
  fields.forEach(f => {
    const inp = document.getElementById(f.id);
    const err = document.getElementById(f.err);
    if (!f.test(inp.value)) { inp.classList.add('error'); err.classList.add('show'); ok = false; }
    else { inp.classList.remove('error'); err.classList.remove('show'); }
  });
  if (!ok || !currentUser) return;
  try {
    const profileData = {
      name: document.getElementById('profileNome').value.trim(),
      surname: document.getElementById('profileCognome').value.trim(),
      phone: document.getElementById('profileTelefono').value.trim(),
      birthDate: document.getElementById('profileBirthDate').value,
      email: currentUser.email,
      createdAt: userProfile?.createdAt || new Date().toISOString(),
    };
    await saveUserProfile(currentUser.uid, profileData);
    userProfile = profileData;
    showToast('Profilo salvato!', 'success');
    updateAuthUI(currentUser);
    hideAllAuthSteps();
    document.getElementById('authStepLoggedIn').style.display = 'block';
    document.getElementById('authModalTitle').textContent = 'Il tuo profilo';
    document.getElementById('authModalDesc').textContent = '';
    document.getElementById('authAvatar').textContent = (profileData.name[0] + profileData.surname[0]).toUpperCase();
    document.getElementById('authUserEmail').textContent = currentUser.email;
    document.getElementById('authUserName').textContent = `${profileData.name} ${profileData.surname}`;
  } catch (err) {
    console.error('Save profile error:', err);
    showToast('Errore nel salvataggio. Riprova.', 'error');
  }
};

window.handleLogout = async function () {
  try {
    await logout();
    currentUser = null;
    userProfile = null;
    document.getElementById('authMemberBadge').style.display = 'none';
    window.closeAuthModal();
    showToast('Disconnesso.', 'success');
  } catch (err) {
    showToast('Errore durante la disconnessione.', 'error');
  }
};
