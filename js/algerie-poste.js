const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => Number(value || 0).toLocaleString('fr-FR');
const apState = { orders: [], runs: [], shipments: [], admin: false, orderEdit: null, username: '', tab: 'commandes' };
let sb;

function syncThemeIcon() {
  $('#themeIcon').className = 'fa-solid text-sm ' + (document.documentElement.classList.contains('light') ? 'fa-moon' : 'fa-sun');
}
function toggleTheme() {
  const light = document.documentElement.classList.toggle('light');
  try { localStorage.setItem('logitrak_theme', light ? 'light' : 'dark'); } catch {}
  syncThemeIcon();
}
function message(text, error = false) {
  const el = $('#apMessage');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('hidden', !text);
  el.style.color = error ? 'var(--danger)' : 'var(--text-muted)';
}
function switchAPTab(tab) {
  apState.tab = tab;
  $$('[data-ap-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.apTab === tab));
  ['commandes', 'production', 'historique'].forEach(name => {
    const box = $('#apTab_' + name);
    if (box) box.classList.toggle('hidden', name !== tab);
  });
}
function canEdit(row) {
  return !apState.viewer && (apState.admin || Date.now() - new Date(row.created_at).getTime() < 48 * 3600000);
}
function orderRuns(id) { return apState.runs.filter(row => row.commande_id === id); }
function printed(id) { return orderRuns(id).filter(run => APtrace.completed(run)).reduce((sum, row) => sum + Number(row.quantite_imprimee || 0), 0); }
function shippedForRun(runId) {
  return apState.shipments.filter(line => line.ap_production_id === runId).reduce((sum, line) => sum + Number(line.quantite || 0), 0);
}
function remainingForPrint(order) {
  return order.quantite_demandee - orderRuns(order.id).reduce((sum, run) =>
    sum + Number(run.statut === 'EN_COURS' ? run.quantite_prevue : run.quantite_imprimee), 0);
}

// Calcule automatiquement le prochain numéro d'ID à reprendre après tous les paquets (terminés ou en cours) de la commande
function nextStartIdForOrder(orderId) {
  const runs = orderRuns(orderId);
  let maxEnd = null;
  let padLen = 8;
  for (const r of runs) {
    const rawEnd = String(r.numero_fin || '').replace(/\s/g, '');
    if (/^\d+$/.test(rawEnd)) {
      const val = BigInt(rawEnd);
      if (maxEnd === null || val > maxEnd) {
        maxEnd = val;
        padLen = rawEnd.length || 8;
      }
    }
  }
  if (maxEnd === null) return '';
  const nextVal = maxEnd + 1n;
  const s = String(nextVal).padStart(padLen, '0');
  return s.length === 8 ? s.replace(/^(\d{2})(\d{3})(\d{3})$/, '$1 $2 $3') : s;
}

// Quantité déjà planifiée/produite sur une commande (pour afficher le rang exact De / À)
function alreadyPlannedForOrder(orderId) {
  return orderRuns(orderId).reduce((sum, run) =>
    sum + Number(run.statut === 'EN_COURS' ? run.quantite_prevue : run.quantite_imprimee), 0);
}

function resetOrder() {
  apState.orderEdit = null;
  $('#apOrderForm').reset();
  $('#apNumberField').hidden=true;
  $('#apOrderDate').value = logitrakToday();
  $('#apOrderTitle').innerHTML = '<i class="fa-solid fa-plus text-amber-500 mr-1.5"></i>Nouvelle commande UPW';
  $('#apOrderCancel').classList.add('hidden');
  fillSubtypes();
}
function fillSubtypes(selected = '') {
  const category = $('#apCategory').value;
  $('#apSubtype').innerHTML = '<option value="">Choisir un produit</option>' + Object.entries(APproducts)
    .filter(([, product]) => product.category === category)
    .map(([code, product]) => '<option value="' + code + '">' + esc(product.label + ' · ' + product.copies + ' exemplaires') + '</option>').join('');
  $('#apSubtype').value = selected;
}

async function loadAP() {
  const [orders, runs, shipments, machines] = await Promise.all([
    readLogiTrakRows(sb, 'ap_commandes'),
    readLogiTrakRows(sb, 'ap_productions'),
    readLogiTrakRows(sb, 'lignes_expedition', 'id,ap_production_id,quantite,expedition_id,expeditions(numero_bl,validation,date_envoi)'),
    readLogiTrakRows(sb, 'machines_usine').catch(error=>{
      if(['42P01','PGRST205'].includes(error.code)) return [];
      throw error;
    }),
  ]);
  apState.shipments = shipments.filter(line => line.ap_production_id);
  apState.machines=machines;
  apState.orders = orders.sort((a, b) => b.date_commande.localeCompare(a.date_commande) || b.created_at.localeCompare(a.created_at));
  apState.runs = runs.sort((a, b) => a.date_production.localeCompare(b.date_production) || a.created_at.localeCompare(b.created_at));

  $('#apClients').innerHTML = [...new Set(orders.map(o => o.client))].sort().map(value => '<option value="' + esc(value) + '">').join('');
  const printers = [...new Set(runs.map(run => run.imprimante).filter(Boolean))].sort();
  const machine = $('#apTraceMachine').value;
  $('#apTraceMachine').innerHTML = '<option value="">Toutes les machines</option>' + printers.map(value => '<option value="' + esc(value) + '">' + esc(value) + '</option>').join('');
  if (printers.includes(machine)) $('#apTraceMachine').value = machine;

  renderKPIs();
  renderOrders();
  renderProductionTab();
  renderSimpleHistory();
}

function renderKPIs() {
  const totalStock = apState.runs
    .filter(run => APtrace.completed(run))
    .reduce((sum, run) => sum + Math.max(0, Number(run.quantite_imprimee || 0) - shippedForRun(run.id)), 0);
  $('#apCount').textContent = fmt(apState.orders.length);
  $('#apRequested').textContent = fmt(apState.orders.reduce((sum, order) => sum + order.quantite_demandee, 0));
  $('#apInStock').textContent = fmt(totalStock);
  $('#apRemaining').textContent = fmt(apState.orders.reduce((sum, order) => sum + Math.max(0, order.quantite_demandee - printed(order.id)), 0));
}

/* ==================== 1. COMMANDES ==================== */
function renderOrders() {
  const search = $('#apSearch').value.trim().toLowerCase(), filter = $('#apFilter').value;
  const list = apState.orders.filter(order => (!filter || filter === order.categorie) &&
    (!search || [order.ap_numero, order.client, order.sous_categorie, order.date_commande].join(' ').toLowerCase().includes(search)));

  $('#apOrdersList').innerHTML = list.map(order => {
    const spec = apProductSpec(order.type_produit);
    const totalPrinted = printed(order.id);
    const rem = Math.max(0, order.quantite_demandee - totalPrinted);
    return '<div class="panel p-4 flex flex-wrap items-center justify-between gap-3">' +
      '<div class="space-y-1">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="font-mono-code font-bold text-amber-500">' + esc(order.ap_numero || 'APN') + '</span>' +
          '<b class="text-sm">' + esc(order.client) + '</b>' +
          '<span class="text-xs px-2 py-0.5 rounded-full" style="background:var(--bg-input);color:var(--text-muted)">' + esc(spec?.label || order.sous_categorie) + '</span>' +
          '<span class="text-xs" style="color:var(--text-muted)">' + esc(order.date_commande) + '</span>' +
        '</div>' +
        '<div class="text-xs" style="color:var(--text-muted)">Commandés : <b>' + fmt(order.quantite_demandee) + ' ID</b> · Produits : <b class="text-emerald-500">' + fmt(totalPrinted) + ' ID</b> · Reste à produire : <b class="text-amber-500">' + fmt(rem) + ' ID</b></div>' +
        (order.observations ? '<div class="text-xs italic" style="color:var(--text-dim)">' + esc(order.observations) + '</div>' : '') +
      '</div>' +
      '<div class="flex flex-wrap items-center gap-2">' +
        (rem > 0 ? '<button type="button" class="btn btn-primary op-only" data-ap-action="goto-prod" data-id="' + esc(order.id) + '"><i class="fa-solid fa-print"></i>Produire</button>' : '<span class="badge" style="background:rgba(16,185,129,.15);color:#34d399">Complète</span>') +
        (canEdit(order) ? '<button type="button" class="btn btn-secondary" data-ap-action="edit-order" data-id="' + esc(order.id) + '">Modifier</button>' : '') +
        (canEdit(order)&&(apState.admin||!orderRuns(order.id).length) ?
        '<button type="button" class="btn btn-secondary" data-ap-action="delete-order" data-id="' + esc(order.id) + '">Supprimer</button>' : '') +
      '</div>' +
    '</div>';
  }).join('') || '<p class="panel p-5 text-sm">Aucune commande à afficher.</p>';
}

/* ==================== 2. PRODUCTION & STOCK ==================== */
function renderProductionTab() {
  const picker = $('#apPrintOrder'), selected = picker.value;
  const printable = apState.orders.filter(order => apProductSpec(order.type_produit) && remainingForPrint(order) > 0);
  picker.innerHTML = '<option value="">— Choisir une commande à produire —</option>' + printable.map(order =>
    '<option value="' + esc(order.id) + '">' + esc((order.ap_numero || 'APN') + ' · ' + order.client + ' · ' + apProductSpec(order.type_produit).label) + ' (' + fmt(remainingForPrint(order)) + ' ID disponibles)</option>'
  ).join('');
  if (printable.some(order => order.id === selected)) picker.value = selected;
  if (!$('#apProdDate').value) $('#apProdDate').value = logitrakToday();

  setupInlineProductionForm();

  // Impressions en cours sur les machines
  const active = apState.runs.filter(run => run.statut === 'EN_COURS');
  $('#apActive').innerHTML = active.map(run => {
    const order = apState.orders.find(row => row.id === run.commande_id);
    const remOrder = order ? remainingForPrint(order) : 0;
    const nextStart = order && remOrder > 0 ? nextStartIdForOrder(order.id) : '';
    const nextQty = order && remOrder > 0 ? Math.min(1000, remOrder) : 0;
    const nextEnd = nextStart && nextQty > 0 ? APcalc.lastId(nextStart, nextQty) : '';
    return '<div class="panel-soft p-3 flex flex-wrap justify-between items-center gap-3">' +
      '<div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="ap-active-machine"><i class="fa-solid fa-print mr-1" aria-hidden="true"></i>' + esc(run.imprimante || 'Machine non renseignée') + '</span><span class="ap-running"><i aria-hidden="true"></i>En marche</span>' +
          '<b>' + esc(order?.ap_numero || '') + ' · ' + esc(order?.client || '') + '</b>' +
          '<span class="text-xs" style="color:var(--text-muted)">Opérateur : <b class="ap-operator">' + esc(run.created_by || '—') + '</b></span>' +
        '</div>' +
        '<p class="text-sm font-mono-code mt-2">Plage en cours : <b><span class="ap-range-word">De</span> ' + esc(run.numero_debut || '—') + ' <span class="ap-range-word">à</span> ' + esc(run.numero_fin || '—') + '</b> (' + fmt(run.quantite_prevue) + ' ID)</p>' +
      '</div>' +
      '<div class="flex flex-wrap gap-2">' +
        (canEdit(run) && nextStart && nextEnd ? '<button type="button" class="btn btn-primary" data-ap-action="validate-and-continue" data-id="' + esc(run.id) + '" title="Valide ce paquet et lance immédiatement la plage ' + esc(nextStart) + ' → ' + esc(nextEnd) + ' sur ' + esc(run.imprimante) + '"><i class="fa-solid fa-forward"></i>Valider &amp; lancer la suite (' + esc(nextStart) + ')</button>' : '') +
        (canEdit(run) ? '<button type="button" class="btn btn-secondary" data-ap-action="validate-run" data-id="' + esc(run.id) + '"><i class="fa-solid fa-check text-emerald-400"></i>Valider et stocker</button>' : '') +
      '</div></div>';
  }).join('') || '<p class="text-xs" style="color:var(--text-muted)">Aucune impression en cours sur les machines.</p>';

  // Stock des paquets produits & colisage par commande
  const stockHtml = [];
  for (const order of apState.orders) {
    const spec = apProductSpec(order.type_produit);
    if (!spec) continue;
    const completed = orderRuns(order.id).filter(r => APtrace.completed(r));
    if (!completed.length) continue;
    const totalProduced = completed.reduce((s, r) => s + Number(r.quantite_imprimee || 0), 0);
    const totalShipped = completed.reduce((s, r) => s + shippedForRun(r.id), 0);
    const availableIds = Math.max(0, totalProduced - totalShipped);
    if (availableIds <= 0) continue;

    const cartons = apCartons(availableIds, spec, completed[0]);
    const totalCartons = cartons.reduce((s, c) => s + c.count, 0);
    const totalGrossKg = cartons.reduce((s, c) => s + (c.grossKg ? c.grossKg * c.count : 0), 0);
    const packetsCount = APcalc.packing(availableIds).packages;

    stockHtml.push('<div class="panel-soft p-4 flex flex-wrap items-center justify-between gap-3">' +
      '<div class="space-y-1">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="font-mono-code font-bold text-amber-500">' + esc(order.ap_numero || 'APN') + '</span>' +
          '<b>' + esc(order.client) + '</b>' +
          '<span class="text-xs" style="color:var(--text-muted)">' + esc(spec.label) + ' · Réf. ' + esc(spec.reference) + '</span>' +
        '</div>' +
        '<div class="text-xs">En stock disponible : <b class="text-emerald-500">' + fmt(availableIds) + ' ID</b> (' + fmt(packetsCount) + ' paquet(s)) · ' +
        'Colisage : <b class="text-amber-400">' + fmt(totalCartons) + ' carton(s) H1</b>' +
        (totalGrossKg ? ' · ≈ ' + totalGrossKg.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' kg' : '') + '</div>' +
      '</div>' +
      '<div class="flex flex-wrap gap-2">' +
        '<a class="btn btn-secondary" href="colisage.html?commande-ap=' + encodeURIComponent(order.id) + '"><i class="fa-solid fa-boxes-packing"></i>Détail colisage</a>' +
        '<button type="button" class="btn btn-primary op-only" data-ap-action="ship-order" data-id="' + esc(order.id) + '"><i class="fa-solid fa-truck-fast"></i>Envoyer</button>' +
      '</div>' +
    '</div>');
  }
  $('#apStockList').innerHTML = stockHtml.join('') || '<p class="text-xs" style="color:var(--text-muted)">Aucun paquet en stock disponible pour le moment.</p>';
}

function setupInlineProductionForm() {
  const orderId = $('#apPrintOrder').value;
  const workspace = $('#apProdWorkspace');
  const order = apState.orders.find(o => o.id === orderId);
  if (!order || !apProductSpec(order.type_produit)) {
    workspace.classList.add('hidden');
    return;
  }
  const available = remainingForPrint(order);
  if (available <= 0) {
    workspace.classList.add('hidden');
    return;
  }
  workspace.classList.remove('hidden');
  const busy = new Set(apState.runs.filter(run=>run.statut==='EN_COURS').map(run=>run.imprimante));
  const registry=apState.machines.filter(machine=>machine.imprimante_ap);
  const names=registry.length?registry.filter(machine=>machine.etat==='En service').map(machine=>machine.nom):
    ['IMP1','IMP2','IMP3','IMP4',...apState.runs.map(run=>run.imprimante)];
  const printers=[...new Set(names)].filter(name=>name&&!busy.has(name)).sort();
  $('#apProdOperator').textContent=apState.username||'—';
  $('#apProdRemaining').textContent=fmt(available)+' ID';
  $('#apAvailablePrinters').innerHTML=printers.map(name=>'<option value="'+esc(name)+'"></option>').join('');
  const wrap = $('#apPrintRows');
  const autoStartId = nextStartIdForOrder(order.id);
  const rowMarkup = (index, first, suggestedPrinter = '') => '<tr class="ap-print-row" data-row="' + index + '">' +
    '<td><input class="inp ap-first font-mono-code" inputmode="numeric" maxlength="16" placeholder="09 000 001" value="' + esc(first) + '" ' + (index === 0 ? 'required' : 'readonly') + '></td>' +
    '<td><input class="inp ap-last font-mono-code" readonly></td>' +
    '<td><input class="inp ap-seq-start" type="number" readonly></td>' +
    '<td><input class="inp ap-seq-end" type="number" readonly></td>' +
    '<td><input class="inp input-uppercase ap-printer" list="apAvailablePrinters" required maxlength="160" placeholder="IMP1" value="' + esc(suggestedPrinter) + '"></td>' +
    '<td class="ap-row-actions"><button type="button" class="ap-add-row" title="Démarrer cette impression" aria-label="Démarrer cette impression"><i class="fa-solid fa-plus"></i></button></td></tr>';

  if (wrap.dataset.orderId !== order.id || !wrap.children.length) {
    wrap.dataset.orderId = order.id;
    wrap.innerHTML = rowMarkup(0, autoStartId, printers[0] || '');
  } else {
    // Si la 1re ligne a encore l'ancien ID ou est vide alors qu'une suite existe, on met à jour automatiquement avec la suite
    const firstInput = wrap.querySelector('.ap-first');
    if (firstInput && autoStartId && !firstInput.dataset.manual) {
      firstInput.value = autoStartId;
    }
  }
  updateInlineRows();
}

function updateInlineRows() {
  const order = apState.orders.find(o => o.id === $('#apPrintOrder').value);
  if (!order) return;
  const available = remainingForPrint(order);
  const baseOrdinal = alreadyPlannedForOrder(order.id) + 1;
  const wrap = $('#apPrintRows');
  let next = '', offset = 0;
  const rows = [...wrap.querySelectorAll('.ap-print-row')];
  rows.forEach((row, i) => {
    const first = row.querySelector('.ap-first'), last = row.querySelector('.ap-last');
    const seqStart = row.querySelector('.ap-seq-start'), seqEnd = row.querySelector('.ap-seq-end');
    const qty = Math.min(1000, Math.max(1, available - offset));
    if (i > 0) first.value = next;
    const actualQty = Math.min(qty, available - offset);
    last.value = first.value ? APcalc.lastId(first.value, actualQty) : '';
    seqStart.value = baseOrdinal + offset;
    seqEnd.value = baseOrdinal + offset + actualQty - 1;
    next = last.value ? APcalc.lastId(last.value, 2) : '';
    offset += actualQty;
    const add = row.querySelector('.ap-add-row');
    add.hidden = i !== rows.length - 1;
    add.disabled = i !== rows.length - 1 || actualQty < 1 || !last.value;
  });
}

async function saveInlineProduction(button) {
  if ($("#apProdSaveBtn").disabled) return;
  const order = apState.orders.find(o => o.id === $('#apPrintOrder').value);
  if (!order) return message('Choisissez une commande.', true);
  const available = remainingForPrint(order);
  const busy = new Set(apState.runs.filter(run => run.statut === 'EN_COURS').map(run => run.imprimante));
  const rows = [...$$('#apPrintRows .ap-print-row')];
  const prodDate = $('#apProdDate').value || logitrakToday();
  let total = 0; const payloads = []; const used = new Set();

  for (const row of rows) {
    const printer = row.querySelector('.ap-printer').value.trim().toUpperCase();
    const qty = Number(row.querySelector('.ap-seq-end').value) - Number(row.querySelector('.ap-seq-start').value) + 1;
    const first = row.querySelector('.ap-first').value.trim();
    const last = row.querySelector('.ap-last').value.trim();
    if (!printer || !first || !last) return message('Complétez la machine et le 1er ID (8 chiffres) de chaque ligne.', true);
    if ((apState.machines||[]).some(machine=>machine.imprimante_ap) && !(apState.machines||[]).some(machine=>machine.imprimante_ap&&machine.nom===printer&&machine.etat==='En service')) return message('Choisissez une imprimante Algérie Poste en service dans le registre Machines.', true);
    if (used.has(printer) || busy.has(printer)) return message('Une machine ne peut pas avoir deux tirages en cours simultanément : ' + printer, true);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 1000) return message('Chaque paquet doit contenir entre 1 et 1 000 ID.', true);
    const err = APcalc.rangeError(first, last, qty);
    if (err) return message(err, true);
    used.add(printer); total += qty;
    payloads.push({
      commande_id: order.id,
      statut: 'EN_COURS',
      quantite_prevue: qty,
      quantite_imprimee: 0,
      imprimante: printer,
      numero_debut: first,
      numero_fin: last,
      date_production: prodDate,
    });
  }
  if (total > available) return message('La somme dépasse le reste de la commande (' + fmt(available) + ' ID).', true);

  const save = $('#apProdSaveBtn');
  if (button !== save) save.disabled = true;
  try { await withButton(button, async () => {
    for (const payload of payloads) await saveRecord('ap_productions', payload, null);
    $('#apPrintRows').innerHTML = '';
    delete $('#apPrintRows').dataset.orderId;
    await loadAP();
    message('Impression enregistrée dans les machines en cours.');
  }); } finally { save.disabled = false; }
}

/* ==================== 3. HISTORIQUE SIMPLE PAR PAQUET ==================== */
function expandRunToPackets(run, order, base) {
  const qty = Number(APtrace.completed(run) ? run.quantite_imprimee : run.quantite_prevue) || 0;
  if (qty <= 0) return [];
  const rawStart = String(run.numero_debut || '').replace(/\s/g, '');
  const isNum = /^\d+$/.test(rawStart);
  const padLen = rawStart.length || 8;
  const fmtId = n => {
    const s = String(n).padStart(padLen, '0');
    return s.length === 8 ? s.replace(/^(\d{2})(\d{3})(\d{3})$/, '$1 $2 $3') : s;
  };
  const packets = [];
  let offset = 0;
  while (offset < qty) {
    const count = Math.min(1000, qty - offset);
    const from = isNum ? fmtId(BigInt(rawStart) + BigInt(offset)) : (offset === 0 ? run.numero_debut : '—');
    const to = isNum ? fmtId(BigInt(rawStart) + BigInt(offset + count - 1)) : run.numero_fin;
    packets.push({
      date: run.date_production, orderId:run.commande_id, finishedAt:run.termine_at,
      ap_numero: order?.ap_numero || 'APN',
      client: order?.client || '—',
      from,
      to,
      count, ordinalStart:base+offset+1, ordinalEnd:base+offset+count,
      machine: run.imprimante || 'Non renseignée',
      operator: run.termine_par || run.created_by || 'Non renseigné',
      created_at: run.created_at,
    });
    offset += count;
  }
  return packets;
}

function renderSimpleHistory() {
  const byOrder = new Map(apState.orders.map(o => [o.id, o]));
  const search = ($('#apTraceSearch').value || '').trim().toLowerCase();
  const idQuery = ($('#apTraceId').value || '').replace(/\s/g, '');
  const machineFilter = $('#apTraceMachine').value;

  const offsets=new Map(), totals=new Map();
  for(const run of [...apState.runs].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))) {
    const base=totals.get(run.commande_id)||0;
    offsets.set(run.id,base);
    totals.set(run.commande_id,base+Number(run.statut==='EN_COURS'?run.quantite_prevue:run.quantite_imprimee));
  }
  const ordinal=value=>String(value).padStart(4,'0');
  const allPackets = apState.runs
    .filter(run => APtrace.completed(run))
    .slice()
    .sort((a, b) => b.date_production.localeCompare(a.date_production) || b.created_at.localeCompare(a.created_at))
    .flatMap(run => expandRunToPackets(run, byOrder.get(run.commande_id), offsets.get(run.id)));

  const filtered = allPackets.filter(pkt => {
    if (machineFilter && pkt.machine !== machineFilter) return false;
    if (idQuery) {
      const f = pkt.from.replace(/\s/g, ''), t = pkt.to.replace(/\s/g, '');
      if (/^\d+$/.test(idQuery) && /^\d+$/.test(f) && /^\d+$/.test(t)) {
        if (BigInt(idQuery) < BigInt(f) || BigInt(idQuery) > BigInt(t)) return false;
      } else if (!f.includes(idQuery) && !t.includes(idQuery)) return false;
    }
    if (search && ![pkt.date, pkt.ap_numero, pkt.client, pkt.from, pkt.to, pkt.machine, pkt.operator].join(' ').toLowerCase().includes(search)) return false;
    return true;
  });

  $('#apTraceCount').textContent = fmt(filtered.length) + ' paquet(s)';
  const groups=new Map();
  for(const packet of filtered) {
    const key=packet.date+'|'+packet.orderId;
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(packet);
  }
  const clock=new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Algiers',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  $('#apTraceRows').innerHTML = [...groups.values()].map(packets=>{
    const first=packets[0];
    return '<tr><th colspan="6" class="p-3 text-left" style="background:var(--bg-input)">'+
      esc(first.date)+' · '+esc(first.ap_numero)+' · '+esc(first.client)+'</th></tr>'+
      packets.sort((a,b)=>a.ordinalStart-b.ordinalStart).map(pkt=>'<tr class="border-b" style="border-color:var(--border)">'+ 
      '<td class="p-3 whitespace-nowrap font-mono-code"><span class="ap-range-word">De</span> ' + esc(pkt.from) + ' <span class="ap-range-word">à</span> ' + esc(pkt.to) + '</td>' +
      '<td class="p-3 whitespace-nowrap font-mono-code"><span class="ap-range-word">De</span> ' + ordinal(pkt.ordinalStart) + ' <span class="ap-range-word">à</span> ' + ordinal(pkt.ordinalEnd) + '</td>' +
      '<td class="p-3 whitespace-nowrap">' + (pkt.finishedAt?clock.format(new Date(pkt.finishedAt)):'—') + '</td>' +
      '<td class="p-3 font-bold ap-operator">OK</td><td class="p-3 font-semibold ap-machine">' + esc(pkt.machine) + '</td>' +
      '<td class="p-3 font-semibold ap-operator">' + esc(pkt.operator) + '</td>' +
    '</tr>'
    ).join('');
  }).join('') || '<tr><td colspan="6" class="p-6 text-center" style="color:var(--text-muted)">Aucun paquet produit correspondant.</td></tr>';
}

/* ==================== ACTIONS & SUPABASE ==================== */
async function saveRecord(table, payload, previous) {
  let query = previous ? sb.from(table).update(payload).eq('id', previous.id).eq('revision', previous.revision) : sb.from(table).insert(payload);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('La fiche a changé ou son délai de modification est dépassé. Actualisez les données.');
  return data.id;
}
async function withButton(button, action) {
  button.disabled = true;
  try { await action(); }
  catch (error) { console.warn(error); message(error.message || 'Opération impossible.', true); }
  finally { button.disabled = false; }
}
async function saveOrder(event) {
  event.preventDefault();
  await withButton($('#apOrderSave'), async () => {
    const spec = apProductSpec($('#apSubtype').value);
    if (!spec) throw new Error('Choisissez un type de produit.');
    const payload = {
      client: $('#apClient').value.trim().toUpperCase(), categorie: $('#apCategory').value,
      type_produit: $('#apSubtype').value, sous_categorie: spec.label, quantite_demandee: Number($('#apQty').value),
      date_commande: $('#apOrderDate').value, observations: $('#apOrderNotes').value.trim(),
    };
    if (!payload.client || !payload.sous_categorie || !Number.isSafeInteger(payload.quantite_demandee) || payload.quantite_demandee < 1)
      throw new Error('Renseignez le client, le produit et une quantité entière positive.');
    if(apState.admin&&apState.orderEdit) payload.ap_numero=$('#apNumber').value.trim();
    const creating=!apState.orderEdit;
    const id=await saveRecord('ap_commandes',payload,apState.orderEdit);
    resetOrder();
    await loadAP();
    if(creating) openProductionOrder(id);
    message('Commande enregistrée.');
  });
}
function editOrder(order) {
  if (!canEdit(order)) return message('Modification réservée à l’administrateur après 48 h.', true);
  apState.orderEdit = order;
  $('#apNumberField').hidden=!apState.admin;
  $('#apNumber').value=order.ap_numero||'';
  for (const [id, key] of Object.entries({ apClient: 'client', apCategory: 'categorie', apQty: 'quantite_demandee', apOrderDate: 'date_commande', apOrderNotes: 'observations' }))
    $('#' + id).value = order[key];
  fillSubtypes(order.type_produit || '');
  $('#apOrderTitle').textContent = 'Modifier la commande UPW';
  $('#apOrderCancel').classList.remove('hidden');
  $('#apClient').focus();
}
async function deleteOrder(order, button) {
  if (!apState.admin && orderRuns(order.id).length) return message('Seul un administrateur peut supprimer une commande dont la production a démarré.', true);
  if (!canEdit(order)) return message('Suppression réservée à l’administrateur après 48 h.', true);
  const runs = orderRuns(order.id);
  if (runs.some(run => apState.shipments.some(line => line.ap_production_id === run.id))) {
    return message('Cette commande est liée à un envoi. Retirez ses tirages de l’envoi avant de la supprimer.', true);
  }
  if (!window.confirm(runs.length ? 'Supprimer cette commande et ses paquets ?' : 'Supprimer cette commande ?')) return;
  await withButton(button, async () => {
    const { data, error } = await sb.from('ap_commandes').delete().eq('id', order.id).eq('revision', order.revision).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('La commande a changé ou le délai est dépassé.');
    if (apState.orderEdit?.id === order.id) resetOrder();
    await loadAP(); message('Commande supprimée.');
  });
}
async function validateAPPrint(run, button) {
  if (!canEdit(run)) return;
  await withButton(button, async () => {
    await saveRecord('ap_productions', { statut: 'TERMINE', quantite_imprimee: run.quantite_prevue }, run);
    $('#apPrintRows').innerHTML = '';
    delete $('#apPrintRows').dataset.orderId;
    await loadAP();
    message('Paquet validé et mis en stock.');
  });
}

// Valide la plage actuelle d'une machine (ex: IMP2) et démarre immédiatement la plage suivante sur cette même machine sans saisie manuelle
async function validateAndContinueAPPrint(run, button) {
  if (!canEdit(run)) return;
  if (!window.confirm('Confirmez-vous que l’impression sur '+run.imprimante+' de '+run.numero_debut+' à '+run.numero_fin+' est terminée ? Le paquet sera mis en stock.')) return;
  const order = apState.orders.find(o => o.id === run.commande_id);
  if (!order) return;
  const rem = remainingForPrint(order);
  const nextStart = nextStartIdForOrder(order.id);
  const nextQty = Math.min(1000, rem);
  const nextEnd = nextStart && nextQty > 0 ? APcalc.lastId(nextStart, nextQty) : '';

  await withButton(button, async () => {
    // 1. Valider la plage qui vient de se terminer sur la machine
    await saveRecord('ap_productions', { statut: 'TERMINE', quantite_imprimee: run.quantite_prevue }, run);
    // 2. Si la commande a encore des ID à produire, lancer directement la nouvelle plage sur la même machine
    if (nextStart && nextEnd && nextQty > 0) {
      try { await saveRecord('ap_productions', {
        commande_id: order.id,
        statut: 'EN_COURS',
        quantite_prevue: nextQty,
        quantite_imprimee: 0,
        imprimante: run.imprimante,
        numero_debut: nextStart,
        numero_fin: nextEnd,
        date_production: logitrakToday(),
      }, null); } catch (error) {
        await loadAP();
        throw new Error('Paquet mis en stock. La plage suivante n’a pas été lancée. '+error.message);
      }
      $('#apPrintRows').innerHTML = '';
      delete $('#apPrintRows').dataset.orderId;
      await loadAP();
      message('Paquet ' + run.numero_debut + ' → ' + run.numero_fin + ' validé · Nouvelle impression ' + nextStart + ' → ' + nextEnd + ' lancée sur ' + run.imprimante + '.');
    } else {
      $('#apPrintRows').innerHTML = '';
      delete $('#apPrintRows').dataset.orderId;
      await loadAP();
      message('Paquet validé et mis en stock (commande complète).');
    }
  });
}

function shipAPOrder(order) {
  location.assign('envois.html?new=1&commande-ap=' + encodeURIComponent(order.id));
}
function openProductionOrder(id) {
  switchAPTab('production');
  $('#apPrintOrder').value=id;
  $('#apPrintRows').replaceChildren();
  delete $('#apPrintRows').dataset.orderId;
  setupInlineProductionForm();
  $('#apPrintRows .ap-first')?.focus();
}
function handleAction(event) {
  const button = event.target.closest('[data-ap-action]');
  if (!button) return;
  const act = button.dataset.apAction;
  if (act === 'validate-run') {
    const run = apState.runs.find(row => row.id === button.dataset.id);
    if (run) validateAPPrint(run, button);
    return;
  }
  if (act === 'validate-and-continue') {
    const run = apState.runs.find(row => row.id === button.dataset.id);
    if (run) validateAndContinueAPPrint(run, button);
    return;
  }
  const order = apState.orders.find(row => row.id === button.dataset.id);
  if (!order) return;
  if (act === 'goto-prod') return openProductionOrder(order.id);
  if (act === 'ship-order') return shipAPOrder(order);
  if (act === 'delete-order') return deleteOrder(order, button);
  if (act === 'edit-order') return editOrder(order);
}

function showGate(html) { $('#gate').innerHTML = html; $('#gate').classList.remove('hidden'); $('#apApp').classList.add('hidden'); }
function loginGate() {
  showGate('<h3 class="font-bold">Connexion opérateur</h3><form onsubmit="doLogin(event)" class="space-y-3">' +
    '<input id="loginUsername" class="inp" required placeholder="Identifiant" autocomplete="username">' +
    '<input id="loginPassword" type="password" class="inp" required placeholder="Mot de passe" autocomplete="current-password">' +
    '<p id="loginMsg" class="text-xs text-rose-400" role="status"></p><button type="submit" class="btn btn-primary">Se connecter</button></form>');
}
async function doLogin(event) {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true;
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: $('#loginUsername').value.trim().toLowerCase() + '@logitrak.internal', password: $('#loginPassword').value });
    if (error || !data?.session) { $('#loginMsg').textContent = 'Identifiant ou mot de passe incorrect.'; return; }
    window.location.assign('index.html');
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; }
}
async function start() {
  try {
    const session = await sb.auth.getSession();
    if (session.error) throw session.error;
    const username = session.data.session?.user?.email?.split('@')[0];
    apState.username = username || '';
    if (!username) { loginGate(); return; }
    const { data, error } = await sb.from('operateurs').select('role').eq('username', username).maybeSingle();
    if (error) throw error;
    apState.admin = data?.role === 'admin';
    apState.viewer = data?.role === 'visionnaire';
    document.body.classList.toggle('is-admin', apState.admin);
    document.body.classList.toggle('is-operator', !!data && !apState.viewer);
    if (!data) { showGate('<p>Compte opérateur requis.</p>'); return; }
    await loadAP();
    resetOrder();
    $('#gate').classList.add('hidden');
    $('#apApp').classList.remove('hidden');
  } catch (error) {
    showGate('<h3 class="font-bold">Module indisponible</h3><p class="text-sm">' + esc(error.message || 'Erreur de chargement') + '</p>');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  syncThemeIcon();
  $$('[data-ap-tab]').forEach(btn => btn.addEventListener('click', () => switchAPTab(btn.dataset.apTab)));
  $('#apOrderForm').addEventListener('submit', saveOrder);
  $('#apOrderCancel').addEventListener('click', resetOrder);
  $('#apCategory').addEventListener('change', () => { $('#apSubtype').value = ''; fillSubtypes(); });
  $('#apSearch').addEventListener('input', renderOrders);
  $('#apFilter').addEventListener('change', renderOrders);
  $('#apOrdersList').addEventListener('click', handleAction);
  $('#apActive').addEventListener('click', handleAction);
  $('#apStockList').addEventListener('click', handleAction);

  $('#apPrintOrder').addEventListener('change', () => {
    $('#apPrintRows').innerHTML = '';
    delete $('#apPrintRows').dataset.orderId;
    setupInlineProductionForm();
  });
  $('#apPrintRows').addEventListener('input', e => {
    if (e.target.matches('.ap-first')) {
      e.target.dataset.manual = '1';
      updateInlineRows();
    }
  });
  $('#apPrintRows').addEventListener('click', e => {
    const add = e.target.closest('.ap-add-row');
    if (add && !add.disabled) saveInlineProduction(add);
  });
  $('#apProdSaveBtn').addEventListener('click', event => saveInlineProduction(event.currentTarget));

  for (const id of ['apTraceId', 'apTraceSearch', 'apTraceMachine']) $('#' + id).addEventListener('input', renderSimpleHistory);
  $('#apReload').addEventListener('click', async e => {
    await withButton(e.currentTarget, async () => { await loadAP(); message('Données actualisées.'); });
  });

  const get = key => { try { return localStorage.getItem(key); } catch { return null; } };
  sb = window.supabase.createClient(get('supabase_url') || SUPABASE_URL, get('supabase_key') || SUPABASE_ANON);
  start();
});
