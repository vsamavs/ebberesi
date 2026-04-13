import { getEvents, createBooking, subscribeNewsletter, formatDate, getBlogPosts, sendOTP, verifyOTP, onAuth, logout, checkMembership, getMembershipInfo, createMembershipBooking, getUserProfile, saveUserProfile, isProfileComplete } from './lib/firebase.js';
import './styles/globals.css';

// ===================================================================
// STATE
// ===================================================================
let events = [];
let blogPosts = [];
let currentStep = 1, qty = 0, isMember = false, selectedPayment = null;
let currentEvent = null;
let currentUser = null;
let isVerifiedMember = false;
let needsMemberSignup = false;
let membershipInfo = null;

// ===================================================================
// INIT
// ===================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  initScrollReveal();
  initAuth();
  handlePaymentReturn();
  await loadEvents();
  await loadBlog();
  initNewsletterForm();
});

// ===================================================================
// PAYMENT RETURN — handle redirect back from Stripe/PayPal/Satispay
// ===================================================================
async function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get('payment');
  const bookingId = params.get('booking');
  const method = params.get('method');

  if (!payment || !bookingId) return;

  // Clean URL
  window.history.replaceState({}, '', window.location.origin);

  if (payment === 'cancelled') {
    showToast('Pagamento annullato.', 'error');
    return;
  }

  if (payment === 'success') {
    // For PayPal: capture the order server-side first
    if (method === 'paypal') {
      const token = params.get('token');
      try {
        await fetch('/api/paypal-capture-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: token, bookingId }),
        });
      } catch (e) { console.error('PayPal capture error:', e); }
    }

    // Verify actual payment status server-side (poll a few times for webhooks/callbacks)
    let confirmed = false;
    for (let i = 0; i < 5; i++) {
      try {
        const res = await fetch('/api/check-payment-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId }),
        });
        const data = await res.json();
        if (data.status === 'paid') { confirmed = true; break; }
      } catch (e) { /* retry */ }
      // Wait 2 seconds before retrying
      await new Promise(r => setTimeout(r, 2000));
    }

    if (confirmed) {
      showToast('Pagamento completato! Riceverai una conferma via email.', 'success');
    } else {
      showToast('Pagamento in attesa di conferma. Ti aggiorneremo via email.', 'error');
    }
  }
}

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

    // Status logic based on Firestore status field
    const isBookable = ev.status === 'available' && spotsLeft > 0;
    const isPlanning = ev.status === 'planning' || ev.status === 'draft';
    const isSoldOut = ev.status === 'available' && spotsLeft <= 0;
    const fewSpots = ev.status === 'available' && spotsLeft > 0 && spotsLeft <= 8;

    let statusClass = 'available', statusText = 'Disponibile';
    if (isPlanning) { statusClass = 'planning'; statusText = 'In programmazione'; }
    else if (isSoldOut) { statusClass = 'soldout'; statusText = 'Esaurito'; }
    else if (fewSpots) { statusClass = 'few'; statusText = 'Ultimi Posti'; }

    // Button logic
    let actionButton;
    if (isPlanning) {
      actionButton = `<span class="btn-book-planning">In programmazione</span>`;
    } else if (isBookable) {
      actionButton = `<button class="btn-book" onclick="window.openBooking('${ev.id}')">Prenota</button>`;
    } else {
      actionButton = `<button class="btn-book" disabled style="opacity:0.4;cursor:default">Esaurito</button>`;
    }

    return `
      <div class="event-card reveal" data-event-id="${ev.id}">
        <div class="event-img"${ev.image ? ` style="background:url('${ev.image}') center/cover no-repeat"` : ''}${isPlanning ? ' class="event-img-planning"' : ''}>
          ${ev.image ? '' : `<div class="event-img-overlay">${ev.emoji || '🍷'}</div>`}
          <div class="event-date-badge">
            <div class="day">${d.day || '?'}</div>
            <div class="month">${d.month || 'TBD'}</div>
          </div>
          <span class="event-status ${statusClass}">${statusText}</span>
        </div>
        <div class="event-body">
          <h3>${ev.title}</h3>
          <div class="event-meta">
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              ${d.time || 'Da definire'}
            </span>
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              ${ev.location || 'Da definire'}
            </span>
          </div>
          <p>${ev.description || ''}</p>
          ${ev.longDescription ? `<button class="btn-event-detail" onclick="window.openEventDetail('${ev.id}')">Scopri di più</button>` : ''}
          <div class="event-footer">
            <div class="event-price">
              ${isPlanning ? '<span style="font-size:.9rem;font-family:var(--sans)">Prezzo da definire</span>' : `€${ev.price}<span class="member-price">Soci: €${memberPrice}</span>`}
            </div>
            ${actionButton}
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

  qty = 0; selectedPayment = null; currentStep = 1;
  needsMemberSignup = false;

  // If logged in and verified member, auto-enable and lock toggle
  if (currentUser && isVerifiedMember) {
    isMember = true;
    document.getElementById('memberSwitch').classList.add('on');
    document.getElementById('memberToggle').style.opacity = '0.7';
    document.getElementById('memberToggle').style.pointerEvents = 'none';
    document.getElementById('memberToggleDesc').textContent = 'Sconto applicato automaticamente';
  } else {
    isMember = false;
    document.getElementById('memberSwitch').classList.remove('on');
    document.getElementById('memberToggle').style.opacity = '';
    document.getElementById('memberToggle').style.pointerEvents = '';
    document.getElementById('memberToggleDesc').textContent = 'Sconto del 15% su un biglietto';
  }

  // Reset UI
  document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('btnPay').disabled = true;
  document.getElementById('btnPay').textContent = 'Scegli un metodo';
  ['fieldNome','fieldCognome','fieldEmail','fieldTelefono','fieldNote','fieldIndirizzo','fieldCitta','fieldCAP','fieldCF'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('error'); }
  });
  document.querySelectorAll('.form-error').forEach(e => e.classList.remove('show'));

  // Pre-fill form if logged in
  if (currentUser && userProfile) {
    document.getElementById('fieldNome').value = userProfile.name || '';
    document.getElementById('fieldCognome').value = userProfile.surname || '';
    document.getElementById('fieldEmail').value = currentUser.email || '';
    document.getElementById('fieldTelefono').value = userProfile.phone || '';
  }

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

// ===================================================================
// EVENT DETAIL MODAL
// ===================================================================
window.openEventDetail = function (eventId) {
  const ev = events.find(e => e.id === eventId);
  if (!ev || !ev.longDescription) return;

  const d = formatDate(ev.date);
  const modal = document.getElementById('eventDetailModal');
  const isBookable = ev.status === 'available' && ((ev.totalSpots || 30) - (ev.bookedSpots || 0)) > 0;

  document.getElementById('detailTitle').textContent = ev.title;
  document.getElementById('detailDate').textContent = d.full || 'Data da definire';
  document.getElementById('detailLocation').textContent = ev.location || 'Location da definire';

  // Convert double newlines to paragraphs
  const paragraphs = ev.longDescription.split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  document.getElementById('detailBody').innerHTML = paragraphs;

  // Show/hide booking button
  const detailActions = document.getElementById('detailActions');
  if (isBookable) {
    detailActions.innerHTML = `<button class="modal-btn modal-btn-next" style="flex:1" onclick="closeEventDetail();window.openBooking('${ev.id}')">Prenota questo evento</button>`;
  } else if (ev.status === 'planning') {
    detailActions.innerHTML = `<p style="text-align:center;color:var(--ink-muted);font-size:.88rem">Evento in fase di programmazione — le prenotazioni apriranno presto.</p>`;
  } else {
    detailActions.innerHTML = `<p style="text-align:center;color:var(--ink-muted);font-size:.88rem">Evento esaurito.</p>`;
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeEventDetail = function () {
  document.getElementById('eventDetailModal').classList.remove('active');
  document.body.style.overflow = '';
};

document.getElementById('eventDetailModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) window.closeEventDetail();
});

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

  // Update step dots (2b maps to step 2 visually)
  const numericStep = step === '2b' ? 2.5 : (typeof step === 'string' ? parseInt(step) : step);
  document.querySelectorAll('.step-dot').forEach(d => {
    const s = +d.dataset.step;
    d.className = 'step-dot';
    if (s <= Math.floor(numericStep) && s < Math.ceil(numericStep)) d.classList.add('done');
    else if (s === Math.ceil(numericStep)) d.classList.add('active');
  });
  document.querySelectorAll('.step-label').forEach((l, i) => {
    l.className = 'step-label';
    if (i + 1 < numericStep) l.classList.add('done');
    else if (i + 1 <= numericStep) l.classList.add('active');
  });

  if (step === 3 || step === '3') populateRecap();
  if (step === 4 || step === '4') {
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
    // 15% discount on ONE ticket only
    const disc = isMember ? currentEvent.price * 0.15 : 0;
    // Membership fee if toggling socio but not yet a member
    const memberFee = (isMember && !isVerifiedMember) ? 10 : 0;
    const total = sub - disc + memberFee;

    document.getElementById('summaryQtyLabel').textContent = `${qty}\u00D7 Biglietto`;
    document.getElementById('summarySubtotal').textContent = fmt(sub);
    document.getElementById('summaryDiscountRow').style.display = isMember ? 'flex' : 'none';
    document.getElementById('summaryDiscount').textContent = '\u2212' + fmt(disc);
    document.getElementById('summaryMemberFeeRow').style.display = (isMember && !isVerifiedMember) ? 'flex' : 'none';
    document.getElementById('summaryTotal').textContent = fmt(total);
  } else {
    s.style.display = 'none';
  }
}

window.toggleMember = function () {
  // If already a verified member, toggle is locked — do nothing
  if (isVerifiedMember) return;

  // If not logged in, prompt login first
  if (!currentUser) {
    window.closeBooking();
    window.openAuthModal();
    showToast('Accedi per usufruire dello sconto socio', 'success');
    return;
  }

  isMember = !isMember;
  needsMemberSignup = isMember && !isVerifiedMember;
  document.getElementById('memberSwitch').classList.toggle('on', isMember);
  updateQtyUI();
};

// ===================================================================
// FORM VALIDATION
// ===================================================================
window.validateStep2 = function () {
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
  if (!ok) return;

  // If user wants to become a member but isn't yet, show membership form
  if (needsMemberSignup) {
    goStep('2b');
  } else {
    goStep(3);
  }
};

window.validateMembershipAndContinue = function () {
  let ok = true;
  const fields = [
    { id: 'fieldIndirizzo', err: 'errIndirizzo', test: v => v.trim().length >= 3 },
    { id: 'fieldCitta', err: 'errCitta', test: v => v.trim().length >= 2 },
    { id: 'fieldCAP', err: 'errCAP', test: v => /^\d{5}$/.test(v.trim()) },
    { id: 'fieldCF', err: 'errCF', test: v => /^[A-Z0-9]{16}$/i.test(v.trim()) },
  ];
  fields.forEach(f => {
    const inp = document.getElementById(f.id);
    const err = document.getElementById(f.err);
    if (!f.test(inp.value)) { inp.classList.add('error'); err.classList.add('show'); ok = false; }
    else { inp.classList.remove('error'); err.classList.remove('show'); }
  });
  if (ok) goStep(3);
};

// ===================================================================
// PAYMENT RECAP
// ===================================================================
function populateRecap() {
  if (!currentEvent) return;
  const sub = qty * currentEvent.price;
  const disc = isMember ? currentEvent.price * 0.15 : 0;
  const memberFee = (isMember && !isVerifiedMember) ? 10 : 0;
  const total = sub - disc + memberFee;
  const d = formatDate(currentEvent.date);

  document.getElementById('recapEvent').textContent = currentEvent.title;
  document.getElementById('recapDate').textContent = d.full;
  document.getElementById('recapQty').textContent = `${qty}\u00D7 Biglietto`;
  document.getElementById('recapSubtotal').textContent = fmt(sub);
  document.getElementById('recapDiscountRow').style.display = isMember ? 'flex' : 'none';
  document.getElementById('recapDiscount').textContent = '\u2212' + fmt(disc);
  document.getElementById('recapMemberFeeRow').style.display = (isMember && !isVerifiedMember) ? 'flex' : 'none';
  document.getElementById('recapName').textContent =
    document.getElementById('fieldNome').value + ' ' + document.getElementById('fieldCognome').value;
  document.getElementById('recapTotal').textContent = fmt(total);
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
  const disc = isMember ? currentEvent.price * 0.15 : 0;
  const memberFee = (isMember && !isVerifiedMember) ? 10 : 0;
  const total = sub - disc + memberFee;
  const amountCents = Math.round(total * 100);
  const email = document.getElementById('fieldEmail').value.trim();

  try {
    // Save booking to Firestore
    const bookingData = {
      eventId: currentEvent.id,
      eventTitle: currentEvent.title,
      qty,
      unitPrice: currentEvent.price,
      discount: disc,
      memberFee,
      total,
      name: document.getElementById('fieldNome').value.trim(),
      surname: document.getElementById('fieldCognome').value.trim(),
      email,
      phone: document.getElementById('fieldTelefono').value.trim(),
      notes: document.getElementById('fieldNote').value.trim(),
      paymentMethod: selectedPayment,
      isMember,
      isNewMember: needsMemberSignup,
    };

    // Add membership data if signing up
    if (needsMemberSignup) {
      bookingData.membershipData = {
        address: document.getElementById('fieldIndirizzo').value.trim(),
        city: document.getElementById('fieldCitta').value.trim(),
        cap: document.getElementById('fieldCAP').value.trim(),
        codiceFiscale: document.getElementById('fieldCF').value.trim().toUpperCase(),
      };
    }

    const bookingId = await createBooking(bookingData);

    // ---- STRIPE ----
    if (selectedPayment === 'stripe') {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, amount: amountCents, eventTitle: currentEvent.title, qty, email }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      throw new Error(data.error || 'Errore Stripe');
    }

    // ---- PAYPAL ----
    if (selectedPayment === 'paypal') {
      const res = await fetch('/api/paypal-create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, amount: amountCents, eventTitle: currentEvent.title, qty }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      throw new Error(data.error || 'Errore PayPal');
    }

    // ---- SATISPAY ----
    if (selectedPayment === 'satispay') {
      const res = await fetch('/api/satispay-create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, amount: amountCents, eventTitle: currentEvent.title }),
      });
      const data = await res.json();
      if (data.redirectUrl) { window.location.href = data.redirectUrl; return; }
      throw new Error(data.error || 'Errore Satispay');
    }

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
  document.getElementById('navToggle')?.addEventListener('click', () => {
    const links = document.getElementById('navLinks');
    const toggle = document.getElementById('navToggle');
    links.classList.toggle('open');
    toggle.classList.toggle('active');
    document.body.style.overflow = links.classList.contains('open') ? 'hidden' : '';
  });
  document.querySelectorAll('.nav-links a').forEach(a =>
    a.addEventListener('click', () => {
      document.getElementById('navLinks').classList.remove('open');
      document.getElementById('navToggle').classList.remove('active');
      document.body.style.overflow = '';
    })
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
          isVerifiedMember = true;
          document.getElementById('authMemberBadge').style.display = '';
        } else {
          isVerifiedMember = false;
        }
        membershipInfo = await getMembershipInfo(user.email);
        updateMembershipCard();
      } catch (e) { isVerifiedMember = false; }
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
    document.getElementById('authOtpCode').classList.remove('error');
    document.getElementById('btnVerifyOtp').disabled = false;
    document.getElementById('btnVerifyOtp').textContent = 'Verifica';
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
    isVerifiedMember = false;
    membershipInfo = null;
    document.getElementById('authMemberBadge').style.display = 'none';
    updateMembershipCard();
    window.closeAuthModal();
    showToast('Disconnesso.', 'success');
  } catch (err) {
    showToast('Errore durante la disconnessione.', 'error');
  }
};

// ===================================================================
// MEMBERSHIP CARD & MODAL
// ===================================================================
let selectedMemPayment = null;

function updateMembershipCard() {
  const btn = document.getElementById('membershipCardBtn');
  const tag = document.getElementById('membershipCardTag');
  const note = document.getElementById('membershipCardNote');

  if (!btn) return;

  if (currentUser && membershipInfo && membershipInfo.active) {
    if (membershipInfo.isExpiring) {
      tag.textContent = 'Rinnovo Tessera';
      note.textContent = `La tua tessera scade tra ${membershipInfo.daysUntilExpiry} giorni`;
      btn.textContent = 'Rinnova Tessera';
    } else if (membershipInfo.isExpired) {
      tag.textContent = 'Tessera Scaduta';
      note.textContent = 'La tua tessera è scaduta — rinnova per continuare a usufruire dei vantaggi';
      btn.textContent = 'Rinnova Tessera';
    } else {
      tag.textContent = 'Tessera Attiva';
      const exp = membershipInfo.expiresAt;
      const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
      note.textContent = `Valida fino al ${exp.getDate()} ${months[exp.getMonth()]} ${exp.getFullYear()}`;
      btn.textContent = 'Sei già socio ✓';
      btn.style.opacity = '0.6';
      btn.style.pointerEvents = 'none';
      return;
    }
  } else {
    tag.textContent = 'Tessera Annuale';
    note.textContent = 'Valida 12 mesi dalla data di iscrizione';
    btn.textContent = 'Diventa Socio';
  }
  btn.style.opacity = '';
  btn.style.pointerEvents = '';
}

window.handleMembershipAction = function () {
  // Not logged in → login first
  if (!currentUser) {
    window.openAuthModal();
    showToast('Accedi per procedere con il tesseramento', 'success');
    return;
  }

  // Already a member and not expiring → do nothing
  if (membershipInfo && membershipInfo.active && !membershipInfo.isExpiring && !membershipInfo.isExpired) {
    return;
  }

  // Open membership modal
  openMembershipModal();
};

function openMembershipModal() {
  const isRenewal = membershipInfo && (membershipInfo.isExpiring || membershipInfo.isExpired);

  document.getElementById('memModalTag').textContent = isRenewal ? 'Rinnovo' : 'Tesseramento';
  document.getElementById('memModalTitle').textContent = isRenewal ? 'Rinnova la tua tessera' : 'Diventa socio Ebbe Resi';
  document.getElementById('memModalDesc').textContent = isRenewal
    ? 'Rinnova la tessera per continuare a usufruire dei vantaggi socio.'
    : 'Compila i dati per completare il tesseramento.';

  // Pre-fill if we have data from existing membership
  if (isRenewal && membershipInfo) {
    document.getElementById('memIndirizzo').value = membershipInfo.address || '';
    document.getElementById('memCitta').value = membershipInfo.city || '';
    document.getElementById('memCAP').value = membershipInfo.cap || '';
    document.getElementById('memCF').value = membershipInfo.codiceFiscale || '';
  } else {
    ['memIndirizzo', 'memCitta', 'memCAP', 'memCF'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; el.classList.remove('error'); }
    });
  }

  // Validity note
  if (isRenewal && membershipInfo.expiresAt) {
    const newExpiry = new Date(membershipInfo.expiresAt);
    newExpiry.setFullYear(newExpiry.getFullYear() + 1);
    const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    document.getElementById('memValidityNote').textContent =
      `Valida fino al ${newExpiry.getDate()} ${months[newExpiry.getMonth()]} ${newExpiry.getFullYear()}`;
  } else {
    document.getElementById('memValidityNote').textContent = 'Valida 12 mesi dalla data di iscrizione';
  }

  // Confirmation text
  document.getElementById('memConfirmTitle').textContent = isRenewal ? 'Tessera rinnovata!' : 'Benvenuto nel club!';
  document.getElementById('memConfirmSub').textContent = isRenewal
    ? 'La tua tessera è stata rinnovata. Continua a goderti il 15% di sconto!'
    : 'La tua tessera socio è attiva. Da ora hai il 15% di sconto su un biglietto per ogni evento.';

  // Reset payment
  selectedMemPayment = null;
  document.querySelectorAll('#membershipModal .payment-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('btnMemPay').disabled = true;
  document.getElementById('btnMemPay').textContent = 'Scegli un metodo';
  document.querySelectorAll('#membershipModal .form-error').forEach(e => e.classList.remove('show'));

  // Show form, hide confirmation
  document.getElementById('memStepForm').style.display = 'block';
  document.getElementById('memStepDone').style.display = 'none';

  document.getElementById('membershipModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

window.closeMembershipModal = function () {
  document.getElementById('membershipModal').classList.remove('active');
  document.body.style.overflow = '';
};

document.getElementById('membershipModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) window.closeMembershipModal();
});

window.selectMemPayment = function (method) {
  selectedMemPayment = method;
  document.querySelectorAll('#membershipModal .payment-option').forEach(o =>
    o.classList.toggle('selected', o.getAttribute('data-mem-method') === method)
  );
  document.getElementById('btnMemPay').disabled = false;
  const labels = { stripe: 'Paga €10 con carta', paypal: 'Paga €10 con PayPal', satispay: 'Paga €10 con Satispay' };
  document.getElementById('btnMemPay').textContent = labels[method];
};

window.processMembershipPayment = async function () {
  // Validate form
  let ok = true;
  const fields = [
    { id: 'memIndirizzo', err: 'errMemIndirizzo', test: v => v.trim().length >= 3 },
    { id: 'memCitta', err: 'errMemCitta', test: v => v.trim().length >= 2 },
    { id: 'memCAP', err: 'errMemCAP', test: v => /^\d{5}$/.test(v.trim()) },
    { id: 'memCF', err: 'errMemCF', test: v => /^[A-Z0-9]{16}$/i.test(v.trim()) },
  ];
  fields.forEach(f => {
    const inp = document.getElementById(f.id);
    const err = document.getElementById(f.err);
    if (!f.test(inp.value)) { inp.classList.add('error'); err.classList.add('show'); ok = false; }
    else { inp.classList.remove('error'); err.classList.remove('show'); }
  });
  if (!ok || !selectedMemPayment || !currentUser) return;

  const btn = document.getElementById('btnMemPay');
  btn.disabled = true;
  btn.textContent = 'Elaborazione\u2026';

  const isRenewal = membershipInfo && (membershipInfo.isExpiring || membershipInfo.isExpired);

  try {
    // Create a membership booking
    const bookingId = await createMembershipBooking({
      email: currentUser.email,
      name: userProfile?.name || '',
      surname: userProfile?.surname || '',
      phone: userProfile?.phone || '',
      isNewMember: true,
      isRenewal,
      memberFee: 10,
      total: 10,
      paymentMethod: selectedMemPayment,
      membershipData: {
        address: document.getElementById('memIndirizzo').value.trim(),
        city: document.getElementById('memCitta').value.trim(),
        cap: document.getElementById('memCAP').value.trim(),
        codiceFiscale: document.getElementById('memCF').value.trim().toUpperCase(),
      },
      // For renewal: store the old expiry so backend can calculate new one
      renewFromDate: isRenewal && membershipInfo.expiresAt ? membershipInfo.expiresAt.toISOString() : null,
    });

    const amountCents = 1000; // €10

    // Route to payment provider
    let payUrl = null;
    if (selectedMemPayment === 'stripe') {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, amount: amountCents, eventTitle: isRenewal ? 'Rinnovo Tessera Socio' : 'Tessera Socio Ebbe Resi', qty: 1, email: currentUser.email }),
      });
      const data = await res.json();
      payUrl = data.url;
    } else if (selectedMemPayment === 'paypal') {
      const res = await fetch('/api/paypal-create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, amount: amountCents, eventTitle: isRenewal ? 'Rinnovo Tessera Socio' : 'Tessera Socio Ebbe Resi', qty: 1 }),
      });
      const data = await res.json();
      payUrl = data.url;
    } else if (selectedMemPayment === 'satispay') {
      const res = await fetch('/api/satispay-create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, amount: amountCents, eventTitle: isRenewal ? 'Rinnovo Tessera Socio' : 'Tessera Socio Ebbe Resi' }),
      });
      const data = await res.json();
      payUrl = data.redirectUrl;
    }

    if (payUrl) {
      window.location.href = payUrl;
    } else {
      throw new Error('Errore nel pagamento');
    }
  } catch (err) {
    console.error('Membership payment error:', err);
    showToast('Errore durante il pagamento. Riprova.', 'error');
    btn.disabled = false;
    btn.textContent = 'Riprova';
  }
};
