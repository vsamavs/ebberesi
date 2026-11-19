import { getActivePurchaseGroups, onAuth, getUserProfile } from './lib/firebase.js';

document.head.insertAdjacentHTML('beforeend', '<style>#groupContent{margin-left:48px;max-width:900px}.ticket-type-label{font-family:var(--serif);font-size:1.45rem;line-height:1.15;color:var(--ink);margin-bottom:10px}@media(max-width:520px){#groupContent{margin-left:24px}}</style>');
document.head.insertAdjacentHTML('beforeend', '<style>#groupContent .wine-field:nth-child(2){font-size:0}#groupContent .wine-field:nth-child(2) b{font-size:.72rem}#groupContent .wine-field:nth-child(2)>span{font-size:14px}</style>');

let group, user, profile, quantities = {};
const money = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);

document.addEventListener('DOMContentLoaded', async () => {
  onAuth(async currentUser => { user = currentUser; profile = user ? await getUserProfile(user.uid) : null; render(); });
  const groups = await getActivePurchaseGroups();
  const id = new URLSearchParams(location.search).get('group');
  group = groups.find(item => item.id === id) || groups[0];
  render();
});

function typeMark(type) {
  const value = (type || '').toLowerCase();
  const color = value.includes('bianco') ? '#d7af25' : value.includes('rosato') ? '#d77b98' : '#8b2635';
  return value.includes('bollicine') ? `<span style="color:${color}">◦◦◦</span>` : `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color}"></span>`;
}

function render() {
  if (!group) return;
  document.getElementById('groupIntro').textContent = group.eventTitle || 'Selezione vini';
  const wines = group.wines || [];
  const total = wines.reduce((sum, wine, index) => sum + (quantities[index] || 0) * wine.price, 0);
  document.getElementById('groupContent').innerHTML = `<div class="table-wrap" style="max-width:900px"><div class="table-toolbar"><h3>${group.title || 'I vini della serata'}</h3></div>${wines.map((wine, index) => `<div class="wine-row"><div><div class="ticket-type-label">${wine.name}</div><div class="wine-fields"><span class="wine-field"><b>Produttore</b>${wine.producer || '—'}</span><span class="wine-field"><b>Tipologia</b>${typeMark(wine.type)} ${wine.type || '—'}</span><span class="wine-field"><b>Annata</b>${wine.vintage || '—'}</span><span class="wine-field"><b>Denominazione</b>${wine.denominazione || '—'}</span><span class="wine-field"><b>Prezzo</b>${money(wine.price)}</span></div></div><div class="qty-control"><button class="qty-btn" data-index="${index}" data-delta="-1">−</button><span class="qty-num">${quantities[index] || 0}</span><button class="qty-btn" data-index="${index}" data-delta="1">+</button></div></div>`).join('')}<div class="modal-body"><div class="order-total"><span>Totale</span><span>${money(total)}</span></div><hr class="group-divider"><div class="group-data-label">I tuoi dati</div><div class="form-row"><div class="form-group"><label class="form-label">Nome *</label><input class="form-input" id="name" value="${profile?.name || ''}"></div><div class="form-group"><label class="form-label">Cognome *</label><input class="form-input" id="surname" value="${profile?.surname || ''}"></div></div><div class="form-row"><div class="form-group"><label class="form-label">Email *</label><input class="form-input" id="email" type="email" value="${user?.email || profile?.email || ''}"></div><div class="form-group"><label class="form-label">Telefono</label><input class="form-input" id="phone" value="${profile?.phone || ''}"></div></div><button class="modal-btn modal-btn-next" id="submit">Invia richiesta</button></div></div>`;
  document.querySelectorAll('[data-index]').forEach(button => button.onclick = () => { const index = button.dataset.index; quantities[index] = Math.max(0, (quantities[index] || 0) + Number(button.dataset.delta)); render(); });
  document.getElementById('submit').onclick = submit;
}

async function submit() {
  const wines = (group.wines || []).map((wine, index) => ({ ...wine, qty: quantities[index] || 0 })).filter(wine => wine.qty);
  const contact = ['name', 'surname', 'email', 'phone'].reduce((data, key) => (data[key] = document.getElementById(key).value.trim(), data), {});
  if (!wines.length || !contact.name || !contact.surname || !contact.email) return alert('Seleziona almeno una bottiglia e completa i dati obbligatori.');
  const response = await fetch('/api/admin-booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'group-purchase', groupId: group.id, eventTitle: group.eventTitle, contact, wines, total: wines.reduce((sum, wine) => sum + wine.qty * wine.price, 0) }) });
  if (!response.ok) return alert('Non è stato possibile inviare la richiesta.');
  document.getElementById('groupContent').innerHTML = '<div class="empty-state">Richiesta avvenuta con successo. Ti contatteremo per confermare disponibilità e ritiro.</div>';
}
