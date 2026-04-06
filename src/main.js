import { getEvents, createBooking, subscribeNewsletter, formatDate, getBlogPosts } from './lib/firebase.js';
import './styles/globals.css';

// ===================================================================
// STATE
// ===================================================================
let events = [];
let blogPosts = [];
let currentStep = 1, qty = 0, isMember = false, selectedPayment = null;
let currentEvent = null;

// ===================================================================
// INIT
// ===================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  initScrollReveal();
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
        <div class="event-img">
          <div class="event-img-overlay">${ev.emoji || '🍷'}</div>
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
