import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, deleteDoc, addDoc, query, where, orderBy, Timestamp, serverTimestamp } from 'firebase/firestore';
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin.html' }));
}

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
    const [bookingsSnap, eventsSnap, membersSnap, usersSnap, newsletterSnap, expensesSnap, groupsSnap] = await Promise.all([
      getDocs(query(collection(db, 'bookings'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'events'), orderBy('date', 'asc'))),
      getDocs(collection(db, 'members')),
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'newsletter')),
      getDocs(query(collection(db, 'expenses'), orderBy('date', 'desc'))),
      getDocs(collection(db, 'purchase_groups')),
    ]);

    allData.bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allData.events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allData.members = membersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allData.users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allData.newsletter = newsletterSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allData.expenses = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allData.purchaseGroups = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

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
  const totalExpenses = (allData.expenses || []).reduce((sum, expense) => sum + (expense.amount || 0), 0);
  const upcomingEvents = allData.events.filter(e => {
    const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
    return d > new Date();
  });

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><div class="label">Prenotazioni</div><div class="value">${paidBookings.length}</div><div class="sub">${allData.bookings.length} totali</div></div>
    <div class="stat-card"><div class="label">Incasso</div><div class="value">€${totalRevenue.toFixed(0)}</div><div class="sub">da prenotazioni pagate</div></div>
    <div class="stat-card"><div class="label">Uscite</div><div class="value">€${totalExpenses.toFixed(0)}</div><div class="sub">spese registrate</div></div>
    <div class="stat-card"><div class="label">Saldo</div><div class="value">€${(totalRevenue - totalExpenses).toFixed(0)}</div><div class="sub">entrate meno uscite</div></div>
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

  const renderers = { bookings: renderBookings, events: renderEvents, members: renderMembers, users: renderUsers, newsletter: renderNewsletter, accounting: renderAccounting, purchases: renderPurchaseGroups };
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
// ACCOUNTING
// Entrate are derived from confirmed bookings; expenses are internal records.
// ===================================================================
function renderPurchaseGroups() {
  const groups = allData.purchaseGroups || [];
  document.getElementById('tabContent').innerHTML = `<div class="table-wrap"><div class="table-toolbar"><h3>Gruppi di acquisto</h3><button class="btn-sm primary" onclick="openPurchaseGroupForm()">+ Nuovo gruppo</button></div><table><thead><tr><th>Evento</th><th>Scadenza</th><th>Vini</th><th>Stato</th></tr></thead><tbody>${groups.length ? groups.map(g => `<tr><td>${escapeHtml(g.eventTitle || '—')}</td><td>${formatTs(g.deadline)}</td><td>${(g.wines || []).length}</td><td><span class="badge ${g.active ? 'badge-paid' : 'badge-pending'}">${g.active ? 'Attivo' : 'Chiuso'}</span></td></tr>`).join('') : '<tr><td colspan="4" class="empty-state">Nessun gruppo creato</td></tr>'}</tbody></table></div>`;
}

window.openPurchaseGroupForm = function () {
  document.getElementById('editModalTitle').textContent = 'Nuovo gruppo di acquisto';
  document.getElementById('editModalBody').innerHTML = `<div class="field"><label>Evento</label><select id="pgEvent">${(allData.events || []).map(e => `<option value="${e.id}">${escapeHtml(e.title)}</option>`).join('')}</select></div><div class="field"><label>Titolo</label><input id="pgTitle" value="I vini della serata"></div><div class="field"><label>Scadenza</label><input id="pgDeadline" type="datetime-local"></div><div class="field"><label><input id="pgActive" type="checkbox" checked> Gruppo attivo</label></div><div id="pgWines"></div><button class="btn-sm" type="button" onclick="addPurchaseWine()">+ Aggiungi vino</button>`;
  addPurchaseWine(); const button=document.getElementById('editSaveBtn'); button.style.display=''; button.textContent='Crea gruppo'; button.onclick=savePurchaseGroup; document.getElementById('editModal').classList.add('active');
};
window.addPurchaseWine = function () { const host=document.getElementById('pgWines'); host.insertAdjacentHTML('beforeend', `<div class="field pg-wine"><label>Vino</label><input class="pg-producer" placeholder="Produttore"><input class="pg-name" placeholder="Nome vino" style="margin-top:6px"><select class="pg-type" style="margin-top:6px"><option value="bianco">Bianco</option><option value="rosato">Rosato</option><option value="rosso">Rosso</option><option value="bianco bollicine">Bianco bollicine</option><option value="rosato bollicine">Rosato bollicine</option><option value="rosso bollicine">Rosso bollicine</option></select><input class="pg-vintage" placeholder="Annata" style="margin-top:6px"><input class="pg-price" type="number" step="0.01" min="0" placeholder="Prezzo" style="margin-top:6px"><input class="pg-image" placeholder="URL foto (facoltativo)" style="margin-top:6px"></div>`); };
async function savePurchaseGroup() { const eventId=document.getElementById('pgEvent').value; const event=(allData.events||[]).find(e=>e.id===eventId); const wines=[...document.querySelectorAll('.pg-wine')].map(row=>({producer:row.querySelector('.pg-producer').value.trim(),name:row.querySelector('.pg-name').value.trim(),type:row.querySelector('.pg-type').value,vintage:row.querySelector('.pg-vintage').value.trim(),price:Number(row.querySelector('.pg-price').value),image:row.querySelector('.pg-image').value.trim()})).filter(w=>w.producer&&w.name&&Number.isFinite(w.price)); if(!event||!wines.length)return alert('Seleziona un evento e inserisci almeno un vino con prezzo.'); const deadline=document.getElementById('pgDeadline').value; const ref=await addDoc(collection(db,'purchase_groups'),{eventId,eventTitle:event.title,title:document.getElementById('pgTitle').value.trim()||'I vini della serata',active:document.getElementById('pgActive').checked,deadline:deadline?Timestamp.fromDate(new Date(deadline)):null,wines}); await updateDoc(doc(db,'events',eventId),{purchaseGroupId:ref.id,purchaseGroupActive:document.getElementById('pgActive').checked}); closeEditModal(); await loadAllData(); }

function renderAccounting() {
  const expenses = allData.expenses || [];
  const paidBookings = (allData.bookings || []).filter(b => b.status === 'paid');
  const totalIncome = paidBookings.reduce((sum, booking) => sum + (booking.total || 0), 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
  const eventRows = (allData.events || []).map(event => {
    const income = paidBookings.filter(b => b.eventId === event.id).reduce((sum, b) => sum + (b.total || 0), 0);
    const costs = expenses.filter(e => e.eventId === event.id).reduce((sum, e) => sum + (e.amount || 0), 0);
    return { event, income, costs };
  }).filter(row => row.income || row.costs);

  const movements = [
    ...paidBookings.map(booking => ({
      type: 'income', date: booking.paidAt || booking.createdAt, amount: booking.total || 0,
      title: booking.eventTitle || 'Prenotazione', source: booking.paymentMethod || 'Pagamento', eventId: booking.eventId,
    })),
    ...expenses.map(expense => ({
      type: 'expense', date: expense.date || expense.createdAt, amount: expense.amount || 0,
      title: expense.supplier || expense.category || 'Spesa', source: expense.category || 'Spesa', receiptId: expense.receiptPublicId, eventId: expense.eventId,
    })),
  ].sort((a, b) => dateValue(b.date) - dateValue(a.date));

  document.getElementById('tabContent').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="label">Entrate confermate</div><div class="value">${formatEuro(totalIncome)}</div><div class="sub">${paidBookings.length} prenotazioni pagate</div></div>
      <div class="stat-card"><div class="label">Uscite registrate</div><div class="value">${formatEuro(totalExpenses)}</div><div class="sub">${expenses.length} spese</div></div>
      <div class="stat-card"><div class="label">Saldo</div><div class="value">${formatEuro(totalIncome - totalExpenses)}</div><div class="sub">movimenti disponibili</div></div>
    </div>
    <div class="table-wrap">
      <div class="table-toolbar"><h3>Movimenti</h3><div class="table-actions"><button class="btn-sm primary" onclick="openExpenseForm()">+ Registra spesa</button><button class="btn-sm" onclick="exportAccountingCSV()">📥 Esporta CSV</button></div></div>
      <table id="dataTable"><thead><tr><th>Data</th><th>Tipo</th><th>Descrizione</th><th>Categoria / metodo</th><th>Importo</th><th>Documento</th></tr></thead>
      <tbody>${movements.length ? movements.map(m => `<tr><td>${formatTs(m.date)}</td><td><span class="badge ${m.type === 'income' ? 'badge-paid' : 'badge-pending'}">${m.type === 'income' ? 'Entrata' : 'Uscita'}</span></td><td>${escapeHtml(m.title)}</td><td>${escapeHtml(m.source)}</td><td>${formatEuro(m.amount)}</td><td>${m.receiptId ? `<button class="btn-sm" onclick="openReceipt('${escapeAttribute(m.receiptId)}')">Apri</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">Nessun movimento disponibile</td></tr>'}</tbody></table>
    </div>
    <div class="table-wrap"><div class="table-toolbar"><h3>Risultato per evento</h3></div>
      <table><thead><tr><th>Evento</th><th>Entrate</th><th>Uscite</th><th>Margine</th></tr></thead><tbody>${eventRows.length ? eventRows.map(({ event, income, costs }) => `<tr><td>${escapeHtml(event.title || 'Evento')}</td><td>${formatEuro(income)}</td><td>${formatEuro(costs)}</td><td>${formatEuro(income - costs)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty-state">Nessun dato per evento</td></tr>'}</tbody></table>
    </div>`;
}

window.openExpenseForm = function () {
  editingDoc = { collection: 'expenses' };
  document.getElementById('editModalTitle').textContent = 'Registra spesa';
  document.getElementById('editModalBody').innerHTML = `
    <div class="field"><label>Importo (€)</label><input id="expenseAmount" type="number" step="0.01" min="0.01" inputmode="decimal" required></div>
    <div class="field"><label>Data</label><input id="expenseDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required></div>
    <div class="field"><label>Fornitore / descrizione</label><input id="expenseSupplier" maxlength="120" placeholder="Es. Enoteca Rossi" required></div>
    <div class="field"><label>Categoria</label><select id="expenseCategory"><option value="Materiali">Materiali</option><option value="Cibo e bevande">Cibo e bevande</option><option value="Affitto">Affitto</option><option value="Trasporti">Trasporti</option><option value="Servizi">Servizi</option><option value="Altro">Altro</option></select></div>
    <div class="field"><label>Evento (facoltativo)</label><select id="expenseEvent"><option value="">Non associata a un evento</option>${(allData.events || []).map(event => `<option value="${escapeAttribute(event.id)}">${escapeHtml(event.title || 'Evento')}</option>`).join('')}</select></div>
    <div class="field"><label>Metodo di pagamento</label><select id="expenseMethod"><option value="Carta">Carta</option><option value="Contanti">Contanti</option><option value="Bonifico">Bonifico</option><option value="Altro">Altro</option></select></div>
    <div class="field"><label>Scontrino (facoltativo)</label><input id="expenseReceipt" type="file" accept="image/*" capture="environment"><small>Da smartphone si aprirà la fotocamera posteriore. L'immagine viene ridotta prima dell'invio.</small></div>
    <div class="field"><label>Note</label><textarea id="expenseNotes" maxlength="1000"></textarea></div>`;
  const button = document.getElementById('editSaveBtn');
  button.style.display = '';
  button.textContent = 'Registra';
  button.onclick = saveExpense;
  document.getElementById('editModal').classList.add('active');
};

async function saveExpense() {
  const button = document.getElementById('editSaveBtn');
  const amount = Number(document.getElementById('expenseAmount').value);
  if (!Number.isFinite(amount) || amount <= 0) return alert('Inserisci un importo valido.');
  button.disabled = true; button.textContent = 'Salvataggio…';
  try {
    const receiptFile = document.getElementById('expenseReceipt').files[0];
    const receiptPublicId = receiptFile ? await uploadReceipt(receiptFile) : null;
    const date = new Date(`${document.getElementById('expenseDate').value}T12:00:00`);
    await addDoc(collection(db, 'expenses'), {
      amount, date: Timestamp.fromDate(date), supplier: document.getElementById('expenseSupplier').value.trim(),
      category: document.getElementById('expenseCategory').value, eventId: document.getElementById('expenseEvent').value || null,
      paymentMethod: document.getElementById('expenseMethod').value, notes: document.getElementById('expenseNotes').value.trim(),
      receiptPublicId, createdAt: serverTimestamp(),
    });
    closeEditModal(); await loadAllData();
  } catch (error) { console.error(error); alert(`Impossibile registrare la spesa: ${error.message}`); }
  finally { button.disabled = false; button.textContent = 'Salva'; button.onclick = saveEdit; }
}

window.openReceipt = async function (publicId) {
  try {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(`/api/admin-receipts?publicId=${encodeURIComponent(publicId)}`, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Documento non disponibile');
    window.open(payload.url, '_blank', 'noopener');
  } catch (error) { alert(error.message); }
};

async function uploadReceipt(file) {
  if (!file.type.startsWith('image/')) throw new Error('Lo scontrino deve essere un’immagine.');
  const dataUri = await compressImage(file);
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/admin-receipts', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ dataUri, fileName: file.name }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Upload non riuscito');
  return payload.url;
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image(); const reader = new FileReader();
    reader.onerror = reject; reader.onload = () => { image.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', .82));
    }; image.onerror = reject; image.src = reader.result; }; reader.readAsDataURL(file);
  });
}

window.exportAccountingCSV = function () {
  const rows = [
    ['Data', 'Tipo', 'Descrizione', 'Categoria/metodo', 'Importo'],
    ...(allData.bookings || []).filter(b => b.status === 'paid').map(b => [formatTs(b.paidAt || b.createdAt), 'Entrata', b.eventTitle || 'Prenotazione', b.paymentMethod || '', b.total || 0]),
    ...(allData.expenses || []).map(e => [formatTs(e.date || e.createdAt), 'Uscita', e.supplier || '', e.category || '', e.amount || 0]),
  ];
  const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })); const link = document.createElement('a'); link.href = url; link.download = `contabilita_${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
};

function dateValue(value) { return value?.toDate ? value.toDate().getTime() : new Date(value || 0).getTime(); }
function formatEuro(value) { return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0); }
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value || ''; return div.innerHTML; }
function escapeAttribute(value) { return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// ===================================================================
// EDIT EVENT
// ===================================================================
window.editEvent = function (id) {

  document.getElementById('editSaveBtn').style.display = '';
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
    <div class="field"><label>Descrizione estesa (HTML)</label><textarea id="editLongDescription" style="min-height:200px">${event.longDescription || ''}</textarea></div>
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
        longDescription: document.getElementById('editLongDescription').value,
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
