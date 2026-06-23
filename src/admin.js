import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, deleteDoc, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';

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

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || '';
let currentTab = 'bookings';
let allData = {};
let editingDoc = null;

// ===================================================================
// AUTH
// ===================================================================
onAuthStateChanged(auth, (user) => {
  if (user && user.email === ADMIN_EMAIL) {
    document.getElementById('authGate').style.display = 'none';
    document.getElementById('adminLayout').style.display = 'block';
    document.getElementById('adminUserEmail').textContent = user.email;
    loadAllData();
  } else if (user) {
    document.getElementById('authGate').querySelector('p').textContent = 'Accesso non autorizzato. Solo admin.';
    document.getElementById('loginBtn').style.display = 'none';
  } else {
    document.getElementById('authGate').style.display = 'flex';
    document.getElementById('adminLayout').style.display = 'none';
  }
});

window.redirectToLogin = function () {
  window.location.href = '/?openAuth=1';
};

window.handleAdminLogout = async function () {
  await signOut(auth);
  window.location.href = '/';
};

// ===================================================================
// LOAD DATA
// ===================================================================
async function loadAllData() {
  try {
    const [bookingsSnap, eventsSnap, membersSnap, usersSnap, newsletterSnap] = await Promise.all([
      getDocs(query(collection(db, 'bookings'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'events'), orderBy('date', 'asc'))),
      getDocs(collection(db, 'members')),
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'newsletter')),
    ]);

    allData.bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allData.events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allData.members = membersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allData.users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allData.newsletter = newsletterSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    renderStats();
    switchTab(currentTab);
  } catch (err) {
    console.error('Error loading data:', err);
    document.getElementById('tabContent').innerHTML = `<div class="empty-state">Errore nel caricamento dati: ${err.message}</div>`;
  }
}

// ===================================================================
// STATS
// ===================================================================
function renderStats() {
  const paidBookings = allData.bookings.filter(b => b.status === 'paid');
  const totalRevenue = paidBookings.reduce((sum, b) => sum + (b.total || 0), 0);
  const activeMembers = allData.members.filter(m => m.active);
  const upcomingEvents = allData.events.filter(e => {
    const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
    return d > new Date();
  });

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><div class="label">Prenotazioni</div><div class="value">${paidBookings.length}</div><div class="sub">${allData.bookings.length} totali</div></div>
    <div class="stat-card"><div class="label">Incasso</div><div class="value">€${totalRevenue.toFixed(0)}</div><div class="sub">da prenotazioni pagate</div></div>
    <div class="stat-card"><div class="label">Soci attivi</div><div class="value">${activeMembers.length}</div><div class="sub">${allData.members.length} totali</div></div>
    <div class="stat-card"><div class="label">Prossimi eventi</div><div class="value">${upcomingEvents.length}</div><div class="sub">${allData.events.length} totali</div></div>
    <div class="stat-card"><div class="label">Newsletter</div><div class="value">${allData.newsletter.length}</div></div>
    <div class="stat-card"><div class="label">Utenti</div><div class="value">${allData.users.length}</div></div>
  `;
}

// ===================================================================
// TABS
// ===================================================================
window.switchTab = function (tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[onclick*="${tab}"]`)?.classList.add('active');

  const renderers = { bookings: renderBookings, events: renderEvents, members: renderMembers, users: renderUsers, newsletter: renderNewsletter };
  (renderers[tab] || renderBookings)();
};

// ===================================================================
// BOOKINGS TABLE
// ===================================================================
function renderBookings() {
  const data = allData.bookings || [];
  document.getElementById('tabContent').innerHTML = `
    <div class="table-wrap">
      <div class="table-toolbar">
        <h3>Prenotazioni (${data.length})</h3>
        <div class="table-actions">
          <input class="search-input" placeholder="Cerca..." oninput="filterTable(this.value)">
          <button class="btn-sm" onclick="exportCSV('bookings')">📥 Esporta CSV</button>
        </div>
      </div>
      <table id="dataTable">
        <thead>
          <tr><th>Data</th><th>Evento</th><th>Nome</th><th>Email</th><th>Qty</th><th>Totale</th><th>Metodo</th><th>Stato</th><th></th></tr>
        </thead>
        <tbody>
          ${data.length === 0 ? '<tr><td colspan="9" class="empty-state">Nessuna prenotazione</td></tr>' : data.map(b => {
            const date = formatTs(b.createdAt);
            const status = b.status === 'paid' ? '<span class="badge badge-paid">Pagato</span>'
              : b.status === 'pending_cash' ? '<span class="badge badge-cash">Contanti</span>'
              : '<span class="badge badge-pending">Pending</span>';
            return `<tr>
              <td>${date}</td>
              <td>${b.eventTitle || b.type || '-'}</td>
              <td>${b.name || ''} ${b.surname || ''}</td>
              <td>${b.email || ''}</td>
              <td>${b.qty || '-'}</td>
              <td>€${(b.total || 0).toFixed(2)}</td>
              <td>${b.paymentMethod || '-'}</td>
              <td>${status}</td>
              <td><button class="btn-sm" onclick="viewDoc('bookings','${b.id}')">👁</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ===================================================================
// EVENTS TABLE
// ===================================================================
function renderEvents() {
  const data = allData.events || [];
  document.getElementById('tabContent').innerHTML = `
    <div class="table-wrap">
      <div class="table-toolbar">
        <h3>Eventi (${data.length})</h3>
        <div class="table-actions">
          <button class="btn-sm" onclick="exportCSV('events')">📥 Esporta CSV</button>
        </div>
      </div>
      <table id="dataTable">
        <thead>
          <tr><th>Data</th><th>Titolo</th><th>Luogo</th><th>Prezzo</th><th>Posti</th><th>Stato</th><th></th></tr>
        </thead>
        <tbody>
          ${data.map(e => {
            const date = e.date?.toDate ? e.date.toDate().toLocaleDateString('it-IT') : '-';
            const spots = `${e.bookedSpots || 0}/${e.totalSpots || '?'}`;
            const statusBadge = e.status === 'available' ? '<span class="badge badge-available">Disponibile</span>'
              : '<span class="badge badge-planning">Planning</span>';
            return `<tr>
              <td>${date}</td>
              <td>${e.title || ''}</td>
              <td>${e.location || ''}</td>
              <td>€${e.price || 0}</td>
              <td>${spots}</td>
              <td>${statusBadge}</td>
              <td><button class="btn-sm" onclick="editEvent('${e.id}')">✏️</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ===================================================================
// MEMBERS TABLE
// ===================================================================
function renderMembers() {
  const data = allData.members || [];
  document.getElementById('tabContent').innerHTML = `
    <div class="table-wrap">
      <div class="table-toolbar">
        <h3>Soci (${data.length})</h3>
        <div class="table-actions">
          <input class="search-input" placeholder="Cerca..." oninput="filterTable(this.value)">
          <button class="btn-sm" onclick="exportCSV('members')">📥 Esporta CSV</button>
        </div>
      </div>
      <table id="dataTable">
        <thead>
          <tr><th>Nome</th><th>Email</th><th>Telefono</th><th>Città</th><th>CF</th><th>Scadenza</th><th>Stato</th></tr>
        </thead>
        <tbody>
          ${data.length === 0 ? '<tr><td colspan="7" class="empty-state">Nessun socio</td></tr>' : data.map(m => {
            const exp = m.expiresAt?.toDate ? m.expiresAt.toDate() : (m.expiresAt ? new Date(m.expiresAt) : null);
            const expStr = exp ? exp.toLocaleDateString('it-IT') : '-';
            const isExpired = exp && exp < new Date();
            const badge = m.active && !isExpired ? '<span class="badge badge-active">Attivo</span>' : '<span class="badge badge-expired">Scaduto</span>';
            return `<tr>
              <td>${m.name || ''} ${m.surname || ''}</td>
              <td>${m.email || m.id}</td>
              <td>${m.phone || '-'}</td>
              <td>${m.city || '-'}</td>
              <td>${m.codiceFiscale || '-'}</td>
              <td>${expStr}</td>
              <td>${badge}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ===================================================================
// USERS TABLE
// ===================================================================
function renderUsers() {
  const data = allData.users || [];
  document.getElementById('tabContent').innerHTML = `
    <div class="table-wrap">
      <div class="table-toolbar">
        <h3>Utenti (${data.length})</h3>
        <div class="table-actions">
          <input class="search-input" placeholder="Cerca..." oninput="filterTable(this.value)">
          <button class="btn-sm" onclick="exportCSV('users')">📥 Esporta CSV</button>
        </div>
      </div>
      <table id="dataTable">
        <thead>
          <tr><th>Nome</th><th>Cognome</th><th>Email</th><th>Telefono</th><th>Data di nascita</th></tr>
        </thead>
        <tbody>
          ${data.length === 0 ? '<tr><td colspan="5" class="empty-state">Nessun utente</td></tr>' : data.map(u => `<tr>
              <td>${u.name || '-'}</td>
              <td>${u.surname || '-'}</td>
              <td>${u.email || '-'}</td>
              <td>${u.phone || '-'}</td>
              <td>${u.birthDate || '-'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ===================================================================
// NEWSLETTER TABLE
// ===================================================================
function renderNewsletter() {
  const data = allData.newsletter || [];
  document.getElementById('tabContent').innerHTML = `
    <div class="table-wrap">
      <div class="table-toolbar">
        <h3>Newsletter (${data.length})</h3>
        <div class="table-actions">
          <button class="btn-sm" onclick="exportCSV('newsletter')">📥 Esporta CSV</button>
        </div>
      </div>
      <table id="dataTable">
        <thead>
          <tr><th>Email</th><th>Data iscrizione</th></tr>
        </thead>
        <tbody>
          ${data.length === 0 ? '<tr><td colspan="2" class="empty-state">Nessun iscritto</td></tr>' : data.map(n => `<tr>
              <td>${n.email || '-'}</td>
              <td>${formatTs(n.subscribedAt)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ===================================================================
// EDIT EVENT
// ===================================================================
window.editEvent = function (id) {
  const event = allData.events.find(e => e.id === id);
  if (!event) return;
  editingDoc = { collection: 'events', id };

  const dateVal = event.date?.toDate ? event.date.toDate().toISOString().slice(0, 16) : '';

  document.getElementById('editModalTitle').textContent = 'Modifica Evento';
  document.getElementById('editModalBody').innerHTML = `
    <div class="field"><label>Titolo</label><input id="editTitle" value="${event.title || ''}"></div>
    <div class="field"><label>Data e Ora</label><input id="editDate" type="datetime-local" value="${dateVal}"></div>
    <div class="field"><label>Luogo</label><input id="editLocation" value="${event.location || ''}"></div>
    <div class="field"><label>Prezzo (€)</label><input id="editPrice" type="number" step="0.01" value="${event.price || 0}"></div>
    <div class="field"><label>Posti Totali</label><input id="editTotalSpots" type="number" value="${event.totalSpots || 30}"></div>
    <div class="field"><label>Posti Prenotati</label><input id="editBookedSpots" type="number" value="${event.bookedSpots || 0}"></div>
    <div class="field"><label>Stato</label>
      <select id="editStatus">
        <option value="available" ${event.status === 'available' ? 'selected' : ''}>Disponibile</option>
        <option value="planning" ${event.status === 'planning' ? 'selected' : ''}>In programmazione</option>
        <option value="draft" ${event.status === 'draft' ? 'selected' : ''}>Bozza</option>
      </select>
    </div>
    <div class="field"><label>Descrizione breve</label><textarea id="editDescription">${event.description || ''}</textarea></div>
    <div class="field"><label>Immagine (URL Cloudinary)</label><input id="editImage" value="${event.image || ''}"></div>
    <div class="field"><label>Pubblicato</label>
      <select id="editPublished">
        <option value="true" ${event.published !== false ? 'selected' : ''}>Sì</option>
        <option value="false" ${event.published === false ? 'selected' : ''}>No</option>
      </select>
    </div>
  `;
  document.getElementById('editModal').classList.add('active');
};

window.saveEdit = async function () {
  if (!editingDoc) return;
  const btn = document.getElementById('editSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Salvataggio...';

  try {
    if (editingDoc.collection === 'events') {
      const dateStr = document.getElementById('editDate').value;
      const updateData = {
        title: document.getElementById('editTitle').value,
        location: document.getElementById('editLocation').value,
        price: parseFloat(document.getElementById('editPrice').value) || 0,
        totalSpots: parseInt(document.getElementById('editTotalSpots').value) || 30,
        bookedSpots: parseInt(document.getElementById('editBookedSpots').value) || 0,
        status: document.getElementById('editStatus').value,
        description: document.getElementById('editDescription').value,
        image: document.getElementById('editImage').value,
        published: document.getElementById('editPublished').value === 'true',
      };
      if (dateStr) updateData.date = Timestamp.fromDate(new Date(dateStr));

      await updateDoc(doc(db, 'events', editingDoc.id), updateData);
    }

    closeEditModal();
    await loadAllData();
  } catch (err) {
    console.error('Save error:', err);
    alert('Errore nel salvataggio: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salva';
  }
};

window.closeEditModal = function () {
  document.getElementById('editModal').classList.remove('active');
  editingDoc = null;
};

document.getElementById('editModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeEditModal();
});

// ===================================================================
// VIEW DOC
// ===================================================================
window.viewDoc = function (coll, id) {
  const data = allData[coll]?.find(d => d.id === id);
  if (!data) return;

  document.getElementById('editModalTitle').textContent = 'Dettaglio';
  document.getElementById('editModalBody').innerHTML = Object.entries(data).map(([key, val]) => {
    let display = val;
    if (val?.toDate) display = val.toDate().toLocaleString('it-IT');
    else if (typeof val === 'object' && val !== null) display = JSON.stringify(val, null, 2);
    return `<div class="field"><label>${key}</label><div style="padding:8px 0;font-size:.88rem;color:var(--ink-soft);word-break:break-all">${display ?? '-'}</div></div>`;
  }).join('');
  document.getElementById('editSaveBtn').style.display = 'none';
  document.getElementById('editModal').classList.add('active');
};

// ===================================================================
// SEARCH / FILTER
// ===================================================================
window.filterTable = function (query) {
  const rows = document.querySelectorAll('#dataTable tbody tr');
  const q = query.toLowerCase();
  rows.forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
};

// ===================================================================
// EXPORT CSV
// ===================================================================
window.exportCSV = function (collectionName) {
  const data = allData[collectionName];
  if (!data || data.length === 0) return alert('Nessun dato da esportare');

  // Flatten and collect all keys
  const flatData = data.map(row => {
    const flat = {};
    Object.entries(row).forEach(([key, val]) => {
      if (val?.toDate) flat[key] = val.toDate().toISOString();
      else if (typeof val === 'object' && val !== null) flat[key] = JSON.stringify(val);
      else flat[key] = val ?? '';
    });
    return flat;
  });

  const keys = [...new Set(flatData.flatMap(Object.keys))];
  const csv = [
    keys.join(','),
    ...flatData.map(row => keys.map(k => {
      const v = String(row[k] ?? '').replace(/"/g, '""');
      return `"${v}"`;
    }).join(','))
  ].join('\n');

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${collectionName}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ===================================================================
// UTILS
// ===================================================================
function formatTs(ts) {
  if (!ts) return '-';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
