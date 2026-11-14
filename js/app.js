const THEME_KEY  = 'logitrak_theme';
const LOCAL_KEY  = 'eurequat_expeditions_v1';
const CFG_URL    = 'supabase_url';
const CFG_KEY    = 'supabase_key';

const state = {
  supabase:   null,
  session:    null,
  isOperator: false,
  isAdmin:    false,
  expeditions: [],
  filtered:   [],
  expanded:   new Set(),
  view:       'date',
};

let refMemory = {}; 


const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k,v) => { try { localStorage.setItem(k,v); } catch {} };

function fmtDate(d) { if (!d) return '—'; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; }
function dayName(d) { try { return new Date(d+'T00:00').toLocaleDateString('fr-FR',{weekday:'short'}); } catch { return ''; } }
function dayNumber(d) { try { const p = d.split('-'); return p[2]+'/'+p[1]; } catch { return d; } }
function fmtNum(n) { return String(n ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function fmtKg(n) { return Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 3 }); }

// Nettoie et extrait le nombre d'une chaîne ("1 500" -> 1500)
function parseQty(val) {
  if (!val) return 0;
  return parseInt(String(val).replace(/[^0-9]/g, ''), 10) || 0;
}

// Le calcul des cartons est dans js/colisage-calc.js : une seule règle pour toutes les pages

function toast(msg, type='info') {
  const cfg = {
    success: { bg:'rgba(16,185,129,.15)', bd:'rgba(16,185,129,.4)', cl:'#34d399', ic:'fa-circle-check' },
    error:   { bg:'rgba(244,63,94,.15)',  bd:'rgba(244,63,94,.4)',  cl:'#fb7185', ic:'fa-circle-exclamation' },
    warning: { bg:'rgba(245,158,11,.15)', bd:'rgba(245,158,11,.4)', cl:'#fbbf24', ic:'fa-triangle-exclamation' },
    info:    { bg:'rgba(99,102,241,.15)', bd:'rgba(99,102,241,.4)', cl:'#a5b4fc', ic:'fa-circle-info' },
  }[type] || {};
  const el = document.createElement('div');
  el.className = 'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl text-xs font-semibold transition-all duration-300 translate-y-4 opacity-0';
  el.style.cssText += `background:${cfg.bg};border:1px solid ${cfg.bd};color:${cfg.cl};backdrop-filter:blur(12px)`;
  el.innerHTML = `<i class="fa-solid ${cfg.ic}"></i><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.remove('translate-y-4','opacity-0'));
  setTimeout(() => { el.classList.add('translate-y-4','opacity-0'); setTimeout(() => el.remove(), 300); }, 3500);
}

function openModal(id) { const m = document.getElementById(id); if (m) { m.classList.add('open'); setTimeout(() => m.querySelector('input,button')?.focus(), 50); } }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
function confirmDialog(msg) {
  return new Promise(resolve => {
    const m = $('#confirmModal'); m.querySelector('[data-msg]').textContent = msg;
    const yes = m.querySelector('[data-yes]'), no = m.querySelector('[data-no]');
    const done = v => { yes.removeEventListener('click', onYes); no.removeEventListener('click', onNo); closeModal('confirmModal'); resolve(v); };
    const onYes = () => done(true), onNo = () => done(false);
    yes.addEventListener('click', onYes); no.addEventListener('click', onNo); openModal('confirmModal');
  });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.modal-backdrop.open').forEach(m => m.classList.remove('open')); });
$$('.modal-backdrop').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }));

function syncThemeIcon() { $('#themeIcon').className = `fa-solid text-sm ${document.documentElement.classList.contains('light') ? 'fa-moon' : 'fa-sun'}`; }
function toggleTheme() { 
  const isLight = document.documentElement.classList.toggle('light'); 
  lsSet(THEME_KEY, isLight ? 'light' : 'dark'); 
  syncThemeIcon(); 
}

function initSupabase() {
  const url = lsGet(CFG_URL) || SUPABASE_URL, key = lsGet(CFG_KEY) || SUPABASE_ANON;
  if ($('#sbUrl')) $('#sbUrl').value = url;
  if ($('#sbKey')) $('#sbKey').value = key;
  try {
    if (!window.supabase) throw new Error('SDK non chargé');
    state.supabase = window.supabase.createClient(url, key);
  } catch (error) { state.supabase = null; console.warn(error); }
}

let authSync = Promise.resolve();
let authIdentity;
let authSubscription;

async function initAuth() {
  const client = state.supabase;
  if (!client) return fetchData();
  authSubscription?.unsubscribe();
  authIdentity = undefined;
  authSubscription = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
      setTimeout(() => { if (state.supabase === client) syncAuth(session).catch(console.warn); }, 0);
    }
  }).data.subscription;
  const { data, error } = await client.auth.getSession();
  if (error) console.warn(error);
  return syncAuth(data?.session || null);
}

function syncAuth(session) {
  const identity = session?.user?.id || null;
  if (authIdentity === identity) return authSync;
  authIdentity = identity;
  authSync = authSync.catch(console.warn).then(async () => {
    state.session = session;
    state.isViewer = false;
    state.isOperator = false;
    state.isAdmin = false;
    if (session?.user?.email) {
      try {
        const username = session.user.email.split('@')[0].toLowerCase();
        const { data, error } = await state.supabase.from('operateurs').select('role').eq('username', username).maybeSingle();
        if (error) throw error;
        state.isViewer = data?.role === 'visionnaire';
        state.isOperator = !!data && !state.isViewer;
        state.isAdmin = data?.role === 'admin';
      } catch (error) { console.warn(error); }
    }
    document.body.classList.toggle('is-operator', state.isOperator);
    document.body.classList.toggle('is-admin', state.isAdmin);
    if (window.Listes) Listes.init(state.supabase, state.isAdmin).catch(console.warn);
    await fetchData();
  });
  return authSync;
}

function authAction() {
  if (state.session) { 
    confirmDialog('Se déconnecter ?').then(async yes => { 
      if (!yes) return;
      // Déconnexion locale : fonctionne même si le réseau ou le serveur ne répond pas
      try { await state.supabase.auth.signOut({ scope: 'local' }); } catch (e) { console.warn(e); }
      // sécurité : on efface aussi la session gardée dans le navigateur
      try { Object.keys(localStorage).filter(k => /^sb-.*-auth-token/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
      await syncAuth(null);
      toast('Vous êtes déconnecté.', 'info');
    }); 
  }
  else { $('#loginMsg').classList.add('hidden'); openModal('loginModal'); }
}
async function doLogin(e) {
  e.preventDefault();
  const msg = $('#loginMsg');
  const button = e.currentTarget?.querySelector('[type="submit"]');
  msg.classList.add('hidden');
  if (button) button.disabled = true;
  let loginSession;
  try {
    if (!state.supabase) throw new Error('Connexion à la base indisponible.');
    const username = $('#loginUsername').value.trim().toLowerCase();
    const { data, error } = await state.supabase.auth.signInWithPassword({
      email: username + '@logitrak.internal', password: $('#loginPassword').value
    });
    if (error || !data?.session) throw new Error(error?.status === 400 ? 'Pseudo ou mot de passe incorrect.' : 'Connexion impossible. Réessayez.');
    loginSession=data.session;
  } catch (error) {
    msg.textContent = error.message;
    msg.classList.remove('hidden');
    return;
  } finally {
    if (button) button.disabled = false;
  }

  $('#loginPassword').value = '';
  closeModal('loginModal');
  if (requestedShipment) {
    await syncAuth(loginSession);
    await openRequestedShipment();
    return;
  }
  window.location.assign('index.html');
}

function requireOperator() {
  if(state.isViewer) { toast('Ce compte est en lecture seule.','info'); return false; }
  if (state.isOperator && state.supabase) return true;
  toast("Connectez-vous pour effectuer cette action.", "warning");
  $('#loginMsg').classList.add('hidden'); openModal('loginModal');
  return false;
}

function setEnvoisStatus(message) {
  const status = $('#envoisStatus');
  status.textContent = message;
  status.classList.toggle('hidden', !message);
}

async function fetchData() {
  setEnvoisStatus('Chargement des envois…');
  const cacheKey = state.session?.user?.id ? LOCAL_KEY + ':' + state.session.user.id : null;
  let message = '';
  try {
    if (!state.supabase) throw new Error('Connexion à la base indisponible.');
    const [expeditions, lines] = await Promise.all([
      readLogiTrakRows(state.supabase, 'expeditions'),
      readLogiTrakRows(state.supabase, 'lignes_expedition'),
    ]);
    state.expeditions = attachLogiTrakItems(expeditions, lines);
    if (cacheKey) lsSet(cacheKey, JSON.stringify(state.expeditions));
  } catch (error) {
    console.warn('Chargement des envois', error);
    try { state.expeditions = cacheKey ? JSON.parse(lsGet(cacheKey) || '[]') : []; }
    catch { state.expeditions = []; }
    message = state.expeditions.length ? 'Copie locale affichée. La base est indisponible.' : 'Chargement des envois impossible. Réessayez avec le bouton Actualiser.';
  }
  $('#visitorBar').classList.toggle('hidden', state.isOperator || state.expeditions.length > 0);
  setEnvoisStatus(message);
  fillFilters();
  applyFilters();

  refMemory = Object.create(null);
  const clients = new Set(['STOCK']);
  const carriers = new Set(['YAZID', 'YALIDINE', 'DJALAL', 'CLIENT', 'AUTRE']);
  for (const expedition of state.expeditions) {
    if (expedition.transporteur) carriers.add(expedition.transporteur.toUpperCase());
    for (const item of expedition.items) {
      const ref = item.reference?.toUpperCase(), des = item.designation?.toUpperCase();
      if (ref && des && !refMemory[ref]) refMemory[ref] = {
        designation: des, unite: item.unite?.toUpperCase() || 'UN', categorie: item.categorie?.toUpperCase() || '',
      };
      if (item.destinataire) clients.add(item.destinataire.toUpperCase());
    }
  }
  $('#clientsList').innerHTML = [...clients].map(c => '<option value="' + esc(c) + '">').join('');
  $('#carriersList').innerHTML = [...carriers].map(c => '<option value="' + esc(c) + '">').join('');
  fillReferenceOptions();
  if (state.isOperator) fillProductionReferences(state.supabase, refMemory).catch(console.warn);
}

async function fillProductionReferences(client, references) {
  const lots = await readLogiTrakRows(client, 'production', 'id,created_at,reference,designation,unite,categorie');
  if (references !== refMemory) return;
  const seen = new Set();
  lots.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  for (const lot of lots) {
    const ref = lot.reference?.trim().toUpperCase();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    references[ref] = {
      designation: (lot.designation || references[ref]?.designation || '').toUpperCase(),
      unite: (lot.unite || references[ref]?.unite || 'UN').toUpperCase(),
      categorie: (lot.categorie || references[ref]?.categorie || '').toUpperCase(),
    };
  }
  fillReferenceOptions();
}

function fillReferenceOptions() {
  $('#productsList').innerHTML = Object.entries(refMemory).map(([ref, product]) =>
    '<option value="' + esc(ref) + '" label="' + esc(product.designation) + '">').join('');
}

function fillFilters() {
  const years = [...new Set(state.expeditions.map(e => (e.date_envoi||'').slice(0,4)).filter(Boolean))].sort().reverse();
  const dests = [...new Set(state.expeditions.flatMap(e => (e.items||[]).map(i => (i.destinataire||'').toUpperCase())))].filter(Boolean).sort();
  const carriers = [...new Set(state.expeditions.map(e => e.transporteur))].filter(Boolean).sort();
  
  const fill = (id, first, vals) => {
    const sel = document.getElementById(id); if (!sel) return; const cur = sel.value;
    sel.innerHTML = `<option value="all">${first}</option>` + vals.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    sel.value = vals.includes(cur) ? cur : 'all';
  };
  fill('filterYear', '🌐 Toutes années', years); 
  fill('filterDest', '🏢 Tous destinataires', dests);
  fill('filterCarrier', '🚛 Tous transporteurs', carriers);

  // Remplissage du sélecteur d'année des statistiques (du 1er janvier au 31 décembre)
  const currentYear = String(new Date().getFullYear());
  const statYears = [...new Set([currentYear, ...years])].sort().reverse();
  const sSel = document.getElementById('statsYear');
  if (sSel) {
    const prev = sSel.value;
    sSel.innerHTML = statYears.map(y => `<option value="${esc(y)}">📅 Année ${esc(y)}</option>`).join('');
    if (prev && statYears.includes(prev)) sSel.value = prev;
    else if (years.length && !years.includes(currentYear)) sSel.value = years[0];
    else sSel.value = currentYear;
  }
}

// --- RECHERCHE DYNAMIQUE ---
function applyFilters() {
  const q = ($('#searchInput').value || '').toLowerCase().trim();
  const year = $('#filterYear').value;
  if (year !== 'all' && $('#statsYear') && $('#statsYear').value !== year) {
    $('#statsYear').value = year;
  }
  const carr = $('#filterCarrier').value;
  const dest = $('#filterDest').value;

  state.filtered = state.expeditions.filter(e => {
    if (year !== 'all' && !(e.date_envoi||'').startsWith(year)) return false;
    if (state.onlyPending && isValidated(e)) return false;
    if (carr !== 'all' && e.transporteur !== carr) return false;
    if (dest !== 'all' && !(e.items||[]).some(it => (it.destinataire||'').toUpperCase().includes(dest))) return false;
    
    // Recherche textuelle
    if (q) {
      const inHead = [e.date_envoi, e.numero_bl, e.transporteur, e.observations].some(v => (v||'').toLowerCase().includes(q));
      if (inHead) return true;
      
      // Inclure la catégorie dans la recherche
      return (e.items||[]).some(it => 
        [it.reference, it.categorie, it.designation, it.destinataire].some(v => (v||'').toLowerCase().includes(q))
      );
    }
    return true;
  });
  
  state.expanded = new Set(state.filtered.map(e => e.id));
  render();
}

// ----- Validation des envois par un administrateur -----
const isValidated = e => (e.validation || 'VALIDE') === 'VALIDE';
function shipmentDisplayItems(items) {
  const groups=new Map(), visible=[];
  for(const item of items) {
    const detail=item.colisage_detail, packing=detail?.ap_pack;
    if(!detail?.ap_production_id || !apProductSpec(packing?.type)) { visible.push(item); continue; }
    const spec=apProductSpec(packing.type), settings=apPackingSettings(packing.settings,spec);
    const key=JSON.stringify([packing.orderId||packing.orderNumber||item.destinataire,item.destinataire,packing.type,settings]);
    if(!groups.has(key)) {
      const group={item,spec,settings:packing.settings,order:packing.orderNumber,quantity:0};
      groups.set(key,group);
      visible.push(group);
    }
    groups.get(key).quantity+=Number(item.quantite);
  }
  const grouped=new Set(groups.values());
  return visible.flatMap(entry=>{
    if(!grouped.has(entry)) return [entry];
    const parts=apShipmentParts(entry.quantity,entry.spec,entry.settings);
    return [{...entry.item,designation:[entry.spec.label,entry.order,parts[0]?.type].filter(Boolean).join(' · '),
      quantite:String(entry.quantity),cartons:parts.reduce((total,part)=>total+part.nb,0)}];
  });
}
const cartonsOfItem = it => { const n = parseInt(it.cartons); return Number.isFinite(n) ? n : 1; };
function pendingCount() { return state.expeditions.filter(e => !isValidated(e)).length; }

async function validerEnvoi(id, ok = true) {
  if (!state.isAdmin) return toast('Seul un administrateur peut valider un envoi.', 'warning');
  const { error } = await state.supabase.rpc('valider_expedition', { p_id: id, p_valide: ok });
  if (error) return toast('Échec : ' + (error.message || error), 'error');
  toast(ok ? 'Envoi validé.' : 'Validation annulée : l\'envoi est de nouveau à valider.', 'success');
  await fetchData();
}
async function validerTout() {
  if (!state.isAdmin) return;
  const n = pendingCount();
  if (!n) return toast('Aucun envoi à valider.', 'info');
  if (!await confirmDialog(`Valider les ${n} envoi(s) en attente ?`)) return;
  const { data, error } = await state.supabase.rpc('valider_toutes_expeditions');
  if (error) return toast('Échec : ' + (error.message || error), 'error');
  toast(`${data ?? n} envoi(s) validé(s).`, 'success');
  state.onlyPending = false;
  await fetchData();
}
function showPending(on) { state.onlyPending = on; applyFilters(); }
function renderValidationBar() {
  const bar = $('#validationBar'); if (!bar) return;
  const n = pendingCount();
  if (window.LTNavRefreshPending) window.LTNavRefreshPending(state.isOperator ? n : 0);
  if (!state.isOperator || !n) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  bar.innerHTML = `<div class="flex items-center gap-3 min-w-0"><div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(245,158,11,.18);color:#f59e0b"><i class="fa-solid fa-bell"></i></div>
      <div class="min-w-0"><div class="text-sm font-extrabold">${n} envoi(s) ${state.isAdmin ? 'à valider' : 'en attente de validation par un administrateur'}</div>
      <div class="text-[11px]" style="color:var(--text-muted)">Seuls les envois validés sont comptabilisés (statistiques, compteurs). Les quantités sont déjà réservées.</div></div></div>
    <div class="flex items-center gap-2 flex-wrap">
      <button type="button" class="btn btn-secondary" onclick="showPending(${state.onlyPending ? 'false' : 'true'})"><i class="fa-solid fa-filter text-xs"></i>${state.onlyPending ? 'Tout afficher' : 'Voir ces envois'}</button>
      ${state.isAdmin ? '<button type="button" class="btn btn-primary" onclick="validerTout()"><i class="fa-solid fa-check-double"></i>Tout valider</button>' : ''}
    </div>`;
}

function render() {
  // --- Mise à jour des KPIs ---
  let cartons = 0, items = 0; const carriers = {};
  const today = logitrakToday();
  const counted = state.filtered.filter(e => isValidated(e) && e.date_envoi && e.date_envoi <= today);
  counted.forEach(e => { carriers[e.transporteur] = (carriers[e.transporteur]||0) + 1; (e.items||[]).forEach(it => { items++; cartons += cartonsOfItem(it); }); });
  const top = Object.entries(carriers).sort((a,b) => b[1]-a[1])[0] || ['—', 0];
  $('#kpiDays').textContent = counted.length; $('#kpiItems').textContent = items; $('#kpiCartons').textContent = cartons;
  $('#kpiCarrier').textContent = top[0]; $('#kpiCarrierShare').textContent = `${top[1]} départ(s)`;
  const y = $('#filterYear').value; $('#kpiYear').textContent = y === 'all' ? 'Toutes années' : y;


  renderValidationBar();
  const box = $('#dateView');
  if (!state.filtered.length) {
    box.innerHTML = `<div class="panel p-12 text-center" style="color:var(--text-muted)"><i class="fa-regular fa-folder-open text-4xl mb-3 block" style="color:var(--text-dim)"></i><h4 class="text-base font-bold" style="color:var(--text)">Aucun départ trouvé</h4><p class="text-xs mt-1">Aucune expédition ne correspond à vos filtres.</p><button onclick="resetFilters()" class="btn btn-primary mt-4"><i class="fa-solid fa-rotate-left"></i>Réinitialiser</button></div>`;
    $('#tableBody').innerHTML = '<tr><td colspan="11" class="p-8 text-center">Aucun envoi à afficher.</td></tr>';
    return;
  }
  
  box.innerHTML = state.filtered.map(e => {
    const displayItems=shipmentDisplayItems(e.items||[]);
    const cartons = displayItems.reduce((s,it) => s + cartonsOfItem(it), 0);
    const count = displayItems.length, isExpanded = state.expanded.has(e.id);
    
    const isExpired = (new Date() - new Date(e.created_at)) > 48 * 3600 * 1000;
    const validated = isValidated(e);
    const canEdit = state.isAdmin || (!isExpired && !validated);
    const lockMsg = validated ? 'Envoi validé : seul un administrateur peut le modifier.' : 'Délai de 48h dépassé. Seul un admin peut modifier.';
    const valBtn = state.isAdmin
      ? (validated
          ? `<button onclick="validerEnvoi('${esc(e.id)}', false)" class="btn-icon" title="Annuler la validation" aria-label="Annuler la validation"><i class="fa-solid fa-rotate-left text-slate-400"></i></button>`
          : `<button onclick="validerEnvoi('${esc(e.id)}', true)" class="btn btn-primary" style="padding:6px 12px" title="Valider cet envoi"><i class="fa-solid fa-check"></i><span class="hidden sm:inline">Valider</span></button>`)
      : '';
    const statusBadge = validated
      ? `<span class="badge" title="${esc(e.valide_at ? 'Validé le ' + new Date(e.valide_at).toLocaleString('fr-FR') : '')}" style="background:var(--success-bg);color:var(--success);border-color:var(--success)"><i class="fa-solid fa-circle-check"></i>Validé${e.valide_par && e.valide_par !== '(historique)' ? ' par ' + esc(e.valide_par) : ''}</span>`
      : `<span class="badge shipment-in-progress"><i aria-hidden="true"></i>En cours</span>`;
    const editBtn = canEdit 
      ? `<button onclick="openExpeditionModal('${esc(e.id)}')" class="op-only btn-icon" title="Modifier"><i class="fa-solid fa-pen-to-square text-amber-400"></i></button>
         <button onclick="deleteExpedition('${esc(e.id)}')" class="op-only btn-icon" title="Supprimer"><i class="fa-regular fa-trash-can text-rose-400"></i></button>`
      : `<button onclick="toast('${esc(lockMsg)}','warning')" class="op-only btn-icon" title="${esc(lockMsg)}"><i class="fa-solid fa-lock text-slate-500"></i></button>`;

    return `
      <article class="panel overflow-hidden">
        <header class="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none" onclick="toggleAccordion('${esc(e.id)}')">
          <div class="flex items-center gap-4 min-w-0">
            <div class="w-12 h-12 rounded-lg shipment-date flex flex-col items-center justify-center flex-shrink-0">
              <span class="text-[9px] font-black uppercase leading-none">${esc(dayName(e.date_envoi))}</span><span class="text-sm font-black leading-none mt-1">${esc(dayNumber(e.date_envoi))}</span>
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2"><h3 class="font-extrabold text-sm sm:text-base">${esc(fmtDate(e.date_envoi))}</h3><span class="badge font-mono-code" style="background:var(--info-bg);color:var(--info);border-color:var(--info)">${esc(e.numero_bl || 'SANS NUM')}</span>${statusBadge}</div>
              <div class="flex flex-wrap items-center gap-2 mt-1 text-xs" style="color:var(--text-muted)"><span class="inline-flex items-center gap-1 font-semibold" style="color:var(--text)"><i class="fa-solid fa-truck text-indigo-400 text-[11px]"></i>${esc(e.transporteur)}</span><span>•</span><span class="font-bold text-amber-400"><i class="fa-solid fa-box text-[11px]"></i> ${cartons} carton(s)</span><span>•</span><span>${count} article(s)</span></div>
            </div>
          </div>
          <div class="flex items-center gap-2" onclick="event.stopPropagation()">
            <a href="colisage.html?id=${encodeURIComponent(e.id)}" class="btn-icon" title="Fiche de colisage"><i class="fa-solid fa-boxes-packing text-amber-500"></i></a>
            <button onclick="printExpedition('${esc(e.id)}')" class="btn-icon" title="Imprimer BL"><i class="fa-solid fa-print text-indigo-400"></i></button>
            <button onclick="sendExpeditionByEmail('${esc(e.id)}')" class="btn-icon" title="Préparer le tableau pour e-mail" aria-label="Préparer le tableau pour e-mail"><i class="fa-solid fa-envelope text-sky-400"></i></button>
            <button onclick="sendExpeditionByWhatsApp('${esc(e.id)}')" class="btn-icon" title="Partager le tableau par WhatsApp" aria-label="Partager le tableau par WhatsApp"><i class="fa-brands fa-whatsapp text-emerald-400"></i></button>
            ${valBtn}
            ${editBtn}
            <div class="w-8 h-8 rounded-xl flex items-center justify-center" style="background:var(--bg-hover); color:var(--text-muted)"><i id="icon-${esc(e.id)}" class="fa-solid fa-chevron-down text-xs transition-transform ${isExpanded?'rotate-180':''}"></i></div>
          </div>
        </header>
        <div id="content-${esc(e.id)}" class="${isExpanded?'':'hidden'} border-t" style="border-color:var(--border)">
          ${e.observations ? `<div class="px-5 py-2.5 text-xs flex items-center gap-2" style="background:rgba(99,102,241,.08);border-bottom:1px solid rgba(99,102,241,.2);color:#a5b4fc"><i class="fa-solid fa-circle-info"></i><span>${esc(e.observations)}</span></div>` : ''}
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead style="background:var(--bg-input)"><tr class="text-[10px] font-bold uppercase tracking-wider" style="color:var(--text-muted)"><th class="p-3 pl-5 text-left">Référence</th><th class="p-3 text-left">Catégorie</th><th class="p-3 text-left">Désignation</th><th class="p-3 text-left">Destinataire</th><th class="p-3 text-center">Unité</th><th class="p-3 text-right">Quantité</th><th class="p-3 text-center">Cartons</th></tr></thead>
              <tbody class="divide-y" style="border-color:var(--border)">
                ${displayItems.map(it => `<tr class="hover:bg-[var(--bg-hover)] transition"><td class="p-3 pl-5 font-mono-code font-bold text-indigo-400">${esc(it.reference || '-')}</td><td class="p-3 text-slate-400 font-semibold text-xs uppercase">${esc(it.categorie || '-')}</td><td class="p-3 font-semibold">${esc(it.designation || '-')}</td><td class="p-3"><span class="badge ${it.destinataire==='STOCK'?'badge-stock':'badge-client'}">${esc(it.destinataire || 'STOCK')}</span></td><td class="p-3 text-center font-mono-code" style="color:var(--text-muted)">${esc(it.unite || 'UN')}</td><td class="p-3 text-right font-mono-code font-bold">${fmtNum(it.quantite)}</td><td class="p-3 text-center font-bold text-amber-400">${(it.colisage_detail && it.colisage_detail.mixte ? 'mixte' : esc(it.cartons ?? '1'))}</td></tr>`).join('') || '<tr><td colspan="7" class="p-4 text-center text-xs" style="color:var(--text-muted)">Aucun article</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </article>`;
  }).join('');

  const body = $('#tableBody'); let html = '';
  state.filtered.forEach(e => (e.items||[]).forEach(it => {
    html += `<tr class="hover:bg-[var(--bg-hover)] transition"><td class="p-3 pl-5 font-bold whitespace-nowrap">${esc(fmtDate(e.date_envoi))}</td><td class="p-3 font-mono-code text-indigo-400">${esc(e.numero_bl || '-')}</td><td class="p-3 font-semibold">${esc(e.transporteur)}</td><td class="p-3 font-mono-code font-bold text-indigo-400">${esc(it.reference || '-')}</td><td class="p-3 font-semibold text-slate-400 text-xs uppercase">${esc(it.categorie || '-')}</td><td class="p-3">${esc(it.designation || '-')}</td><td class="p-3"><span class="badge ${it.destinataire==='STOCK'?'badge-stock':'badge-client'}">${esc(it.destinataire || 'STOCK')}</span></td><td class="p-3 text-center" style="color:var(--text-muted)">${esc(it.unite || 'UN')}</td><td class="p-3 text-right font-mono-code font-bold">${fmtNum(it.quantite)}</td><td class="p-3 text-center font-bold text-amber-400">${(it.colisage_detail && it.colisage_detail.mixte ? 'mixte' : esc(it.cartons ?? '1'))}</td><td class="p-3 text-xs truncate max-w-xs" style="color:var(--text-muted)">${esc(e.observations || '-')}</td></tr>`;
  }));
  body.innerHTML = html || `<tr><td colspan="11" class="p-8 text-center text-xs" style="color:var(--text-muted)">Aucune expédition</td></tr>`;
}

function toggleAccordion(id) {
  const content = document.getElementById('content-'+id), icon = document.getElementById('icon-'+id); if (!content) return;
  const isHidden = content.classList.toggle('hidden'); icon?.classList.toggle('rotate-180', !isHidden);
  if (isHidden) state.expanded.delete(id); else state.expanded.add(id);
}
function toggleAllAccordions() {
  if (state.expanded.size === state.filtered.length) state.expanded.clear(); else state.expanded = new Set(state.filtered.map(e => e.id));
  render(); toast(state.expanded.size ? 'Toutes les dates dépliées' : 'Toutes les dates repliées', 'info');
}
function switchView(v) {
  const dateBox = $('#dateView'), tableBox = $('#tableView'), bD = $('#viewBtnDate'), bT = $('#viewBtnTable');
  const active = 'px-3 py-1.5 rounded-lg text-xs font-bold transition selected-view', idle = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition';
  if (v === 'date') { dateBox.classList.remove('hidden'); tableBox.classList.add('hidden'); bD.className = active; bT.className = idle; bT.style.color = 'var(--text-muted)'; }
  else { dateBox.classList.add('hidden'); tableBox.classList.remove('hidden'); bT.className = active; bT.style.color = ''; bD.className = idle; bD.style.color = 'var(--text-muted)'; }
}
function resetFilters() { state.onlyPending = false; $('#searchInput').value = ''; $('#filterYear').value = 'all'; $('#filterCarrier').value = 'all'; $('#filterDest').value = 'all'; applyFilters(); }

let rowCounter = 0;

function nextNumEnvoi(dateStr) {
  const y = (dateStr||'').slice(0,4) || String(new Date().getFullYear());
  const re = new RegExp('^ENV' + y + '(\\d+)$'); 
  let max = 0;
  state.expeditions.forEach(e => {
    const m = re.exec(e.numero_bl || '');
    if (m) max = Math.max(max, +m[1]);
  });
  return `ENV${y}${String(max+1).padStart(3,'0')}`;
}

function openExpeditionModal(id) {
  if (!id && !state.isOperator) requestedShipment = {};
  if (!requireOperator()) return;
  const isEdit = !!id, exp = isEdit ? state.expeditions.find(e => e.id === id) : null;
  if (isEdit && !exp) return;
  
  if (isEdit) {
    const isExpired = (new Date() - new Date(exp.created_at)) > 48 * 3600 * 1000;
    if (!state.isAdmin && (isExpired || isValidated(exp))) return toast('Cet envoi est verrouillé pour les opérateurs.', 'error');
  }

  $('#expId').value = isEdit ? exp.id : '';
  $('#expTitle').textContent = isEdit ? `Modifier l'envoi du ${fmtDate(exp.date_envoi)}` : 'Nouvel envoi';
  const today = new Date().toISOString().slice(0,10);
  $('#formDate').value = isEdit ? exp.date_envoi : today;
  $('#formBL').value = isEdit ? (exp.numero_bl || '') : nextNumEnvoi(today);
  // N° d'envoi verrouillé : seul l'administrateur peut le modifier
  $('#formBL').readOnly = !state.isAdmin;
  $('#formBL').classList.toggle('field-locked', !state.isAdmin);
  $('#formBL').title = state.isAdmin ? "N° d'envoi (modifiable par l'administrateur)" : "N° d'envoi verrouillé : seul l'administrateur peut le modifier";
  $('#blLock')?.classList.toggle('hidden', state.isAdmin);
  $('#formCarrier').value = isEdit ? exp.transporteur : 'YAZID';
  $('#formObs').value = isEdit ? (exp.observations || '') : '';
  
  $('#formDate').onchange = (e) => {
    if (!isEdit && e.target.value) {
      $('#formBL').value = nextNumEnvoi(e.target.value);
    }
  };

  $('#apOrderPicker').hidden=true;
  $('#itemsBody').innerHTML = ''; (isEdit ? exp.items : [{}]).forEach(it => addItemRow(it));
  updateModalTotals(); openModal('expeditionModal');
}
// Détail du colisage porté par une ligne (cartons utilisés, mandrin, matière…)
function getDetail(tr) { try { return tr.dataset.detail ? JSON.parse(tr.dataset.detail) : null; } catch (e) { return null; } }
function setDetail(tr, d) { tr.dataset.detail = d ? JSON.stringify(d) : ''; refreshProdTag(tr); }
// Cartons d'une quantité à partir du colisage figé de la ligne
function packingFromDetail(d, qty) {
  return window.LTColis.packing({
    quantite_produite: parseInt(qty, 10) || 0, qte_par_carton: d.qpc, type_carton: d.type_carton, reliquat_carton: d.reliquat_carton,
    poids_bobine: d.poids_bobine, poids_carton_vide: d.poids_carton_vide, poids_carton: d.poids_carton,
  }, parseInt(qty, 10) || 0);
}
function refreshProdTag(tr) {
  const tg = tr.querySelector('[data-prodtag]'); if (!tg) return;
  if (!tr.dataset.prod) { tg.classList.add('hidden'); tg.textContent = ''; return; }
  const d = getDetail(tr);
  let txt = 'OF ' + (tr.dataset.of || '');
  if (d && d.mixte) txt += ' • carton mixte' + (d.carton_mixte ? ' ' + d.carton_mixte : '') + (d.stock_box_id ? ' · ' + d.stock_box_id.slice(0, 8).toUpperCase() : '');
  else if (d && d.manual) txt += ' • cartons modifiés' + (window.LTColis.typesText(d) ? ' (' + window.LTColis.typesText(d) + ')' : '');
  else if (d && d.parts && d.parts.length) txt += ' • ' + window.LTColis.text(d.parts);
  tg.textContent = txt; tg.classList.remove('hidden');
}

function addItemRow(item = {}) {
  const rowId = 'r' + (++rowCounter), tr = document.createElement('tr'); tr.dataset.rowId = rowId;
  tr.innerHTML = `
    <td class="p-2"><input class="inp font-mono-code input-uppercase" data-field="reference" list="productsList" value="${esc(item.reference||'')}" placeholder="📷 Réf" title="Toucher la case vide pour scanner un code-barres ou DataMatrix"><div data-prodtag class="text-[10px] mt-1 font-bold text-amber-500 hidden"></div></td>
    <td class="p-2"><input class="inp input-uppercase" data-field="categorie" list="categoriesList" value="${esc(item.categorie||'')}" placeholder="Catégorie"></td> <!-- NOUVEAU -->
    <td class="p-2"><input class="inp input-uppercase" data-field="designation" value="${esc(item.designation||'')}" placeholder="Désignation"></td>
    <td class="p-2"><input class="inp input-uppercase" data-field="destinataire" list="clientsList" value="${esc(item.destinataire||'STOCK')}"></td>
    <td class="p-2"><input class="inp text-center input-uppercase" data-field="unite" list="unitsList" value="${esc(item.unite||'UN')}"></td>
    <td class="p-2"><input class="inp text-right font-mono-code" data-field="quantite" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="9" placeholder="0" title="Nombre entier uniquement (sans virgule)" value="${esc(digitsOnly(item.quantite))}"></td>
    <td class="p-2"><input class="inp text-center font-bold text-amber-400" data-field="cartons" type="number" min="1" ${(item.colisage_detail && item.colisage_detail.mixte) ? 'disabled placeholder="mixte" value=""' : `value="${esc(item.cartons ?? '1')}"`}></td>
    <td class="p-2 text-center"><button type="button" class="btn-icon" data-remove aria-label="Supprimer"><i class="fa-solid fa-xmark text-rose-400 text-xs"></i></button></td>`;
  $('#itemsBody').appendChild(tr);
  // Données issues de la production et de son colisage (copie figée enregistrée avec la ligne)
  tr.dataset.prod = item.production_id || '';
  tr.dataset.of = item.of_numero || '';
  tr.dataset.linkRef = String(item.reference || '').toUpperCase();
  const det = item.colisage_detail && Object.keys(item.colisage_detail).length ? item.colisage_detail : null;
  tr.dataset.detail = det ? JSON.stringify(det) : '';
  if (det && det.mixte) tr.dataset.mixte = '1';
  if (det?.ap_production_id) {
    for (const field of ['reference','categorie','designation','destinataire','unite','cartons',...(!det.ap_pack?['quantite']:[])]) {
      tr.querySelector('[data-field="'+field+'"]').readOnly = true;
    }
  }
  if (det?.stock_box_id) {
    tr.dataset.stockBox = det.stock_box_id;
    tr.querySelector('[data-field="reference"]').readOnly = true;
    tr.querySelector('[data-field="quantite"]').readOnly = true;
    const client = tr.querySelector('[data-field="destinataire"]');
    client.addEventListener('input', () => {
      $$('#itemsBody tr').filter(row => row.dataset.stockBox === det.stock_box_id).forEach(row => {
        if (row !== tr) row.querySelector('[data-field="destinataire"]').value = client.value;
      });
    });
  }
  if (item.cartonsManual || (det && det.manual)) tr.dataset.cartonsManual = '1';
  refreshProdTag(tr);

  // Si l'opérateur change le nombre de cartons à la main, le colisage automatique est remplacé
  tr.querySelector('[data-field="cartons"]').addEventListener('input', (e) => {
    const cleanC = digitsOnly(e.target.value);
    e.target.value = cleanC || '1';
    tr.dataset.cartonsManual = '1';
    const d = getDetail(tr); if (d && !d.mixte) { d.manual = true; d.parts = []; setDetail(tr, d); }
    updateModalTotals();
  });
  const qtyInput = tr.querySelector('[data-field="quantite"]');
  qtyInput.addEventListener('input', () => {
    const clean = digitsOnly(qtyInput.value);
    if (clean !== qtyInput.value) { qtyInput.value = clean; flashError(qtyInput); }
    qtyInput.classList.remove('inp-error');
    const d = getDetail(tr);
    if (d?.ap_pack && Number(clean)>0) {
      d.parts=apShipmentParts(Number(clean),apProductSpec(d.ap_pack.type),d.ap_pack.settings);
      setDetail(tr,d);
      tr.querySelector('[data-field="cartons"]').value=d.parts.reduce((sum,part)=>sum+part.nb,0);
    } else if (d && d.mixte) { d.qte = parseInt(clean, 10) || 0; setDetail(tr, d); }
    else if (d && d.qpc && tr.dataset.cartonsManual !== '1') {
      // ligne issue d'un colisage : les cartons se recalculent à partir de la quantité
      const pk = packingFromDetail(d, clean);
      if (pk) { d.parts = pk.parts; d.manual = false; setDetail(tr, d); tr.querySelector('[data-field="cartons"]').value = pk.total; }
    }
    updateModalTotals();
  });
  tr.querySelector('[data-remove]').addEventListener('click', () => {
    if (tr.dataset.stockBox) {
      $$('#itemsBody tr').filter(row => row.dataset.stockBox === tr.dataset.stockBox).forEach(row => row.remove());
    } else tr.remove();
    updateModalTotals();
  });

  const refInput = tr.querySelector('[data-field="reference"]');
  const catInput = tr.querySelector('[data-field="categorie"]');
  const desInput = tr.querySelector('[data-field="designation"]');
  const unitInput = tr.querySelector('[data-field="unite"]');

  // Si l'utilisateur change la référence d'une ligne importée, le lien avec la production est coupé
  refInput.addEventListener('input', () => {
    if (tr.dataset.prod && refInput.value.trim().toUpperCase() !== tr.dataset.linkRef) {
      tr.dataset.prod = ''; tr.dataset.of = ''; tr.dataset.detail = ''; tr.dataset.cartonsManual = ''; tr.dataset.mixte = '';
      const cin = tr.querySelector('[data-field="cartons"]'); cin.disabled = false; if (!cin.value) cin.value = '1';
      refreshProdTag(tr); updateModalTotals();
    }
  });
  // Auto-complétion : désignation, unité et catégorie seulement (le colisage vient de « Importer depuis la production »)
  refInput.addEventListener('change', (e) => {
    const ref = e.target.value.trim().toUpperCase();
    if (ref && refMemory[ref]) {
      desInput.value = refMemory[ref].designation;
      if (unitInput) unitInput.value = refMemory[ref].unite;
      if (catInput && refMemory[ref].categorie) catInput.value = refMemory[ref].categorie;
    }
  });

  updateModalTotals();
}
// Garde uniquement les chiffres (supprime virgules, points, espaces, lettres, signes) et les zéros en tête
function digitsOnly(v) {
  const d = String(v ?? '').replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
  return d;
}
function flashError(input) {
  input.classList.add('inp-error');
  setTimeout(() => input.classList.remove('inp-error'), 700);
}
// Renvoie le premier champ quantité invalide (vide ou 0) parmi les lignes remplies
function firstBadQuantity() {
  for (const tr of $$('#itemsBody tr')) {
    const val = f => tr.querySelector(`[data-field="${f}"]`).value.trim();
    if (!val('reference') && !val('designation')) continue;
    const q = tr.querySelector('[data-field="quantite"]');
    if (!/^[0-9]+$/.test(q.value) || parseInt(q.value, 10) < 1) return q;
  }
  return null;
}
function regroupAPCartons(rows) {
  const groups=new Map();
  for(const row of rows) {
    const detail=getDetail(row), packing=detail?.ap_pack;
    if(!packing?.orderId || !apProductSpec(packing.type)) continue;
    const key=JSON.stringify([packing.orderId,packing.type,packing.settings]);
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push({row,detail,packing});
  }
  for(const group of groups.values()) {
    const {packing}=group[0];
    const quantity=group.reduce((sum,{row})=>sum+Number(digitsOnly(row.querySelector('[data-field="quantite"]').value)),0);
    const parts=apShipmentParts(quantity,apProductSpec(packing.type),packing.settings);
    group.forEach(({row,detail},index)=>{
      row.hidden=true;
      detail.parts=index===0?parts:[];
      setDetail(row,detail);
      row.querySelector('[data-field="cartons"]').value=index===0?parts.reduce((sum,part)=>sum+part.nb,0):0;
    });
  }
}
function renderAPCartonSummary(rows) {
  const box=$('#apCartonSummary');
  const groups=new Map();
  for(const row of rows) {
    const packing=getDetail(row)?.ap_pack;
    if(!packing?.orderId) continue;
    if(!groups.has(packing.orderId)) groups.set(packing.orderId,[]);
    groups.get(packing.orderId).push(row);
  }
  box.replaceChildren();
  for(const group of groups.values()) {
    const packing=getDetail(group[0]).ap_pack;
    const cartons=group.reduce((sum,row)=>sum+Number(row.querySelector('[data-field="cartons"]').value),0);
    const quantity=group.reduce((sum,row)=>sum+Number(row.querySelector('[data-field="quantite"]').value),0);
    const div=document.createElement('div');
    div.className='panel-soft p-3 flex flex-wrap items-center justify-between gap-2';
    const label=document.createElement('span');
    label.textContent=[packing.orderNumber,group[0].querySelector('[data-field="destinataire"]').value,fmtNum(quantity)+' ID',cartons+' carton(s)'].filter(Boolean).join(' · ');
    const remove=document.createElement('button');
    remove.type='button'; remove.className='btn btn-secondary'; remove.textContent='Retirer';
    remove.onclick=()=>{ group.forEach(row=>row.remove()); updateModalTotals(); };
    div.append(label,remove);
    box.append(div);
  }
}
function updateModalTotals() {
  const rows = $$('#itemsBody tr'); let total = 0;
  regroupAPCartons(rows);
  renderAPCartonSummary(rows);
  const mixed = new Set();
  rows.forEach(tr => {
    if (tr.dataset.mixte === '1') { mixed.add(tr.dataset.stockBox || 'historique'); return; }
    total += cartonsOfItem({cartons:tr.querySelector('[data-field="cartons"]').value});
  });
  total += mixed.size;
  $('#modalTotal').textContent = `Total : ${total} carton(s)` + (mixed.size ? ` (dont ${mixed.size} mixte(s))` : '');
  $('#itemsCount').textContent = `${rows.length}`;
}
function collectItems() {
  const mixed = new Set();
  return $$('#itemsBody tr').map(tr => {
    const get = f => tr.querySelector(`[data-field="${f}"]`).value.trim().toUpperCase();
    const d = getDetail(tr), mixte = !!(d && d.mixte);
    let cartons = cartonsOfItem({cartons:get('cartons')});
    if (mixte) {
      const key = tr.dataset.stockBox || 'historique';
      cartons = mixed.has(key) ? 0 : 1;
      mixed.add(key);
      d.qte = parseInt(digitsOnly(get('quantite')), 10) || 0;
    }
    return { reference: get('reference'), categorie: get('categorie'), designation: get('designation'), destinataire: get('destinataire') || 'STOCK', unite: get('unite') || 'UN',
      quantite: String(parseInt(digitsOnly(get('quantite')), 10) || 0), cartons,
      production_id: tr.dataset.prod || '', type_carton: window.LTColis.typesText(d), poids_carton: 0, of_numero: tr.dataset.of || '', colisage_detail: d || {} };
  }).filter(it => it.reference || it.designation);
}
async function saveExpedition() {
  if (!requireOperator()) return;
  const dateVal = $('#formDate').value; if (!dateVal) return toast("Date d'expédition requise.", "error");
  const items = collectItems(); if (!items.length) return toast("Renseignez au moins un article.", "error");
  const badQty = firstBadQuantity();
  if (badQty) { badQty.classList.add('inp-error'); badQty.focus(); return toast("Quantité invalide : saisissez un nombre entier supérieur à 0 (sans virgule).", "error"); }
  
  const limitErr = state.isAdmin ? null : await checkProductionLimits(items.filter(i => !i.colisage_detail?.stock_box_id));
  if (limitErr) return toast(limitErr, "error");
  // carton mixte : poids estimé (carton vide + articles) <= 15 kg
  const mix = items.filter(i => i.colisage_detail?.mixte && !i.colisage_detail.stock_box_id).map(i => ({ qte: parseQty(i.quantite), poids_bobine: i.colisage_detail.poids_bobine }));
  if (mix.length && !state.isAdmin) {
    const kg = window.LTColis.mixedWeight(mix, 'H2');
    if (kg > window.LTColis.MAX_CARTON_KG && !await confirmDialog(`Le carton mixte pèserait environ ${kg.toLocaleString('fr-FR')} kg (maximum ${window.LTColis.MAX_CARTON_KG} kg). Enregistrer quand même ?`)) return;
  }
  const payload = { 
    p_id: $('#expId').value || null, 
    p_date_envoi: dateVal, 
    p_numero_bl: ($('#formBL').value.trim() || null)?.toUpperCase(), 
    p_transporteur: $('#formCarrier').value.trim().toUpperCase(), 
    p_observations: $('#formObs').value.trim(), 
    p_items: items 
  };
  
  try {
    const { error } = await state.supabase.rpc('save_expedition', payload);
    if (error) throw error; toast(state.isAdmin ? 'Envoi enregistré.' : 'Envoi enregistré : en attente de validation par un administrateur.', 'success');
  } catch (e) { return toast('Échec : ' + (e.message || e), 'error'); }
  closeModal('expeditionModal'); await fetchData();
}
async function deleteExpedition(id) {
  if (!requireOperator()) return;
  if (!await confirmDialog('Supprimer cet envoi ?')) return;
  try { const { error } = await state.supabase.from('expeditions').delete().eq('id', id); if (error) throw error; toast('Envoi supprimé.', 'success'); }
  catch (e) { return toast('Suppression impossible : ' + (e.message || e), 'error'); }
  await fetchData();
}

function openAdmin() { openModal('adminModal'); }
function toggleKeyVis() { const i = $('#sbKey'); i.type = i.type === 'password' ? 'text' : 'password'; }
function saveSupabaseConfig() {
  if (!requireOperator()) return;
  const url = $('#sbUrl').value.trim(), key = $('#sbKey').value.trim(); if (!url || !key) return toast("URL et clé requises.", "error");
  lsSet(CFG_URL, url); lsSet(CFG_KEY, key); initSupabase(); initAuth().catch(console.warn); closeModal('adminModal'); toast('Configuration enregistrée.', 'success');
}

async function openOperators() { if (!state.isAdmin) return; openModal('opsModal'); await loadOperators(); }
async function loadOperators() {
  const box = $('#opsList'); const { data, error } = await state.supabase.from('operateurs').select('*').order('created_at');
  if (error) return box.innerHTML = `<p class="py-3 text-rose-400">${esc(error.message)}</p>`;
  const me = (state.session?.user?.email || '').split('@')[0];
  box.innerHTML = (data||[]).map(o => `
    <div class="py-2.5 flex items-center justify-between gap-2"><div class="min-w-0"><p class="font-semibold truncate">${esc(o.username)}</p><p class="text-[11px]" style="color:var(--text-muted)">${o.role === 'admin' ? 'Administrateur' : o.role === 'visionnaire' ? 'Visionnaire' : 'Opérateur'}</p></div>
    ${o.username === me ? '<span class="text-[11px]" style="color:var(--text-dim)">vous</span>' : `<button onclick="removeOperator('${esc(o.username)}')" class="btn btn-secondary"><i class="fa-solid fa-trash text-rose-400"></i>Supprimer</button>`}</div>`).join('') || '<p class="py-3 text-xs" style="color:var(--text-muted)">Aucun opérateur.</p>';
}

async function addOperator(e) {
  e.preventDefault();
  const username = $('#opUsername').value.trim().toLowerCase();
  const password = $('#opPassword').value;
  const role = $('#opRole').value;

  if (password.length < 6) return toast("Le mot de passe doit faire 6 caractères minimum.", "error");

  const { error } = await state.supabase.rpc('create_operator', {
    p_username: username,
    p_password: password,
    p_role: role
  });

  if (error) return toast('Création impossible : ' + error.message, 'error');

  $('#opUsername').value = ''; 
  $('#opPassword').value = ''; 
  toast('Compte opérateur créé.', 'success'); 
  await loadOperators();
}

async function removeOperator(username) {
  if (!await confirmDialog(`Supprimer définitivement le compte ${username} ?`)) return;
  const { error } = await state.supabase.rpc('delete_logitrak_operator', {p_username:username});
  if (error) return toast('Retrait impossible : ' + error.message, 'error');
  toast('Compte supprimé.', 'success'); await loadOperators();
}

const SAMPLES = [
  { date_envoi: '2027-01-05', numero_bl: 'ENV2027001', transporteur: 'YAZID', observations: "Départ direct usine vers UPW Beni Abbes", items: [{ reference:'E02CL38B1', categorie:'ETIQUETTES', designation:'ETIQUETTE TT 105*148', destinataire:'UPW BENI ABBES', unite:'ID', quantite:'15000', cartons:1 }] },
  { date_envoi: '2027-01-07', numero_bl: 'ENV2027002', transporteur: 'YAZID', observations: "Livraison Smartware + retour atelier", items: [{ reference:'R2A045300BN', categorie:'RUBANS', designation:'RUBAN CIRE 45*300', destinataire:'SMARTWARE', unite:'UN', quantite:'644', cartons:11 }, { reference:'R2C110300BO', categorie:'RUBANS', designation:'RUBAN RESINE 110*300', destinataire:'STOCK', unite:'UN', quantite:'44', cartons:1 }, { reference:'PVC-100', categorie:'CARTES PVC', designation:'CARTE PVC BLANCHE 0.75mm', destinataire:'STOCK', unite:'UN', quantite:'47', cartons:2 }] },
];
async function loadSamples() {
  if (!requireOperator()) return;
  try {
    const bls = SAMPLES.map(s => s.numero_bl);
    const { data: existing } = await state.supabase.from('expeditions').select('numero_bl').in('numero_bl', bls);
    if (existing && existing.length) return toast('Les exemples existent déjà.', 'warning');
    for (const s of SAMPLES) {
      const { error } = await state.supabase.rpc('save_expedition', { p_id: null, p_date_envoi: s.date_envoi, p_numero_bl: s.numero_bl, p_transporteur: s.transporteur, p_observations: s.observations, p_items: s.items });
      if (error) throw error;
    }
    toast('Exemples ajoutés.', 'success'); closeModal('adminModal'); await fetchData();
  } catch (e) { toast('Échec : ' + e.message, 'error'); }
}

function financialRows(e) {
  return (e.items || []).map(it => ({
    reference: String(it.reference || '-').trim(),
    designation: String(it.designation || '-').trim(),
    unite: String(it.unite || 'UN').trim(),
    quantite: fmtNum(it.quantite || 0)
  }));
}
function buildFinancialListMessage(e) {
  const rows = financialRows(e);
  return [
    'LISTE DES ARTICLES À FACTURER POUR LE TRANSPORT',
    `Date d'envoi : ${fmtDate(e.date_envoi)}`,
    `N° d'envoi : ${e.numero_bl || 'Sans numéro'}`,
    `Transporteur : ${e.transporteur || 'Non renseigné'}`,
    '',
    'Référence | Désignation | Unité | Quantité',
    ...rows.map(r => `${r.reference} | ${r.designation} | ${r.unite} | ${r.quantite}`)
  ].join('\n');
}
function financialItemsTableMarkup(e) {
  const rows = financialRows(e);
  const escHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<table id="financialItemsTable" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px;color:#172033;border:1px solid #cbd5e1;">
    <thead><tr style="background:#1d4ed8;color:#ffffff;">
      <th scope="col" style="padding:12px 14px;text-align:left;border:1px solid #1e40af;background:#1d4ed8;color:#ffffff;font-weight:700;">Référence</th>
      <th scope="col" style="padding:12px 14px;text-align:left;border:1px solid #1e40af;background:#1d4ed8;color:#ffffff;font-weight:700;">Désignation</th>
      <th scope="col" style="padding:12px 14px;text-align:center;border:1px solid #1e40af;background:#1d4ed8;color:#ffffff;font-weight:700;">Unité</th>
      <th scope="col" style="padding:12px 14px;text-align:right;border:1px solid #1e40af;background:#1d4ed8;color:#ffffff;font-weight:700;">Quantité</th>
    </tr></thead><tbody>${rows.map((r,i)=>`<tr style="background:${i%2?'#eff6ff':'#ffffff'};">
      <td style="padding:11px 14px;border:1px solid #cbd5e1;color:#1d4ed8;font-weight:700;">${escHtml(r.reference)}</td>
      <td style="padding:11px 14px;border:1px solid #cbd5e1;color:#172033;font-weight:600;">${escHtml(r.designation)}</td>
      <td style="padding:11px 14px;border:1px solid #cbd5e1;text-align:center;color:#475569;">${escHtml(r.unite)}</td>
      <td style="padding:11px 14px;border:1px solid #cbd5e1;text-align:right;color:#0f172a;font-weight:800;">${escHtml(r.quantite)}</td>
    </tr>`).join('')}</tbody></table>`;
}
function financialTableMarkup(e) {
  const rows = financialRows(e);
  const escHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<div style="font-family:Arial,sans-serif;color:#172033;max-width:100%;">
    <div style="padding:20px 22px;background:#102a43;color:#fff;border-radius:12px 12px 0 0;">
      <div style="font-size:22px;font-weight:800;margin-top:8px;">Liste des articles à facturer</div>
      <div style="font-size:13px;color:#dbeafe;margin-top:7px;">Facturation du transport · ${escHtml(fmtDate(e.date_envoi))}</div>
    </div>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <tbody>
        <tr style="background:#eff6ff;"><td style="padding:10px 12px;color:#475569;font-weight:700;width:150px;border:1px solid #dbeafe;">N° d'envoi</td><td style="padding:10px 12px;font-weight:700;border:1px solid #dbeafe;">${escHtml(e.numero_bl || 'Sans numéro')}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 12px;color:#475569;font-weight:700;border:1px solid #dbeafe;">Transporteur</td><td style="padding:10px 12px;font-weight:700;border:1px solid #dbeafe;">${escHtml(e.transporteur || 'Non renseigné')}</td></tr>
      </tbody>
    </table>
    <table id="financialItemsTable" style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px;margin-top:0;">
      <thead><tr style="background:#2563eb;color:#fff;">
        <th style="padding:13px 12px;text-align:left;border:1px solid #1d4ed8;">Référence</th>
        <th style="padding:13px 12px;text-align:left;border:1px solid #1d4ed8;">Désignation</th>
        <th style="padding:13px 12px;text-align:center;border:1px solid #1d4ed8;">Unité</th>
        <th style="padding:13px 12px;text-align:right;border:1px solid #1d4ed8;">Quantité</th>
      </tr></thead>
      <tbody>${rows.map((r,i)=>`<tr style="background:${i%2?'#eff6ff':'#ffffff'};">
        <td style="padding:12px;border:1px solid #dbeafe;color:#1d4ed8;font-weight:700;white-space:nowrap;">${escHtml(r.reference)}</td>
        <td style="padding:12px;border:1px solid #dbeafe;color:#172033;font-weight:600;">${escHtml(r.designation)}</td>
        <td style="padding:12px;border:1px solid #dbeafe;text-align:center;color:#475569;">${escHtml(r.unite)}</td>
        <td style="padding:12px;border:1px solid #dbeafe;text-align:right;font-weight:800;color:#0f172a;">${escHtml(r.quantite)}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
}
function openFinancialSharePreview(id, channel) {
  const e = state.expeditions.find(x => x.id === id);
  if (!e) return toast('Envoi introuvable.', 'error');
  if (!(e.items || []).length) return toast('Cet envoi ne contient aucun article.', 'warning');
  const popup = window.open('', '_blank');
  if (!popup) return toast('Ouverture bloquée. Autorisez les fenêtres contextuelles puis réessayez.', 'warning');
  const report = financialTableMarkup(e);
  const title = `Liste de facturation transport - ${e.numero_bl || fmtDate(e.date_envoi)}`;
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#eef2f7;color:#172033;font-family:Arial,sans-serif;padding:24px}.wrap{max-width:1000px;margin:0 auto}.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 18px}.btn{border:0;border-radius:9px;padding:12px 16px;font-weight:700;cursor:pointer;color:white}.copy{background:#0f766e}.email{background:#2563eb}.wa{background:#059669}.print{background:#334155}.sheet{background:#fff;border-radius:12px;box-shadow:0 10px 30px #0f172a14;overflow:hidden;padding:20px}@media(max-width:600px){body{padding:10px}.sheet{padding:8px}.btn{flex:1}}
    @media print{body{background:white;padding:0}.toolbar{display:none!important}.sheet{box-shadow:none;padding:0}}
    </style></head><body><div class="wrap"><div class="toolbar"><button class="btn email" onclick="window.opener.sendFinancialEmailRich('${String(id).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">✉ Préparer l’e-mail</button><button class="btn wa" onclick="window.opener.sendFinancialWhatsAppImage('${String(id).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">◉ Partager sur WhatsApp</button><button class="btn print" onclick="window.print()">⎙ Imprimer / PDF</button></div><div class="sheet">${report}</div></div></body></html>`);
  popup.document.close();
}
async function sendFinancialEmailRich(id) {
  const e = state.expeditions.find(x => x.id === id);
  if (!e) return toast('Envoi introuvable.', 'error');
  const html = financialTableMarkup(e);
  const plain = buildFinancialListMessage(e);
  try {
    if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], {type:'text/html'}),
        'text/plain': new Blob([plain], {type:'text/plain'})
      })]);
      toast('Tableau coloré copié. Collez-le dans le corps de votre e-mail.', 'success');
    } else {
      const blob = new Blob([`<!doctype html><meta charset="utf-8"><title>Liste de facturation</title>${html}`], {type:'text/html;charset=utf-8'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Liste-facturation-${(e.numero_bl||'envoi').replace(/[^a-z0-9_-]/gi,'_')}.html`; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      toast('Tableau HTML téléchargé : ouvrez-le et copiez le tableau dans votre e-mail.', 'warning');
    }
  } catch (err) {
    toast('Copie du tableau impossible. Utilisez Imprimer / PDF ou le téléchargement HTML.', 'warning');
  }
  const subject = `Liste pour facturation transport - ${e.numero_bl || fmtDate(e.date_envoi)}`;
  const body = `Bonjour,\n\nVeuillez trouver la liste des articles à facturer pour le transport.\n\nDate : ${fmtDate(e.date_envoi)}\nN° d'envoi : ${e.numero_bl || 'Sans numéro'}\nTransporteur : ${e.transporteur || 'Non renseigné'}\n\nCordialement`;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
async function sendFinancialWhatsAppImage(id) {
  const e = state.expeditions.find(x => x.id === id);
  if (!e) return toast('Envoi introuvable.', 'error');
  const rows = financialRows(e);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const scale = 2, pad = 36, widths = [230, 500, 140, 190], tableW = widths.reduce((a,b)=>a+b,0);
  ctx.font = '600 18px Arial';
  const wrap = (text, maxWidth) => {
    const words = String(text).split(/\s+/); const lines=[]; let line='';
    for (const word of words) { const test=line ? line+' '+word : word; if (ctx.measureText(test).width>maxWidth && line) { lines.push(line); line=word; } else line=test; }
    lines.push(line); return lines;
  };
  const prepared = rows.map(r => {
    const cells=[r.reference,r.designation,r.unite,r.quantite];
    const lines=cells.map((v,i)=>wrap(v,widths[i]-24));
    return {cells,lines,height:Math.max(58,Math.max(...lines.map(a=>a.length))*25+24)};
  });
  const titleH=112, metaH=92, headH=58;
  const height=pad*2+titleH+metaH+headH+prepared.reduce((n,r)=>n+r.height,0);
  canvas.width=(tableW+pad*2)*scale; canvas.height=height*scale; ctx.scale(scale,scale);
  ctx.fillStyle='#f1f5f9';ctx.fillRect(0,0,tableW+pad*2,height);
  ctx.fillStyle='#102a43';ctx.fillRect(pad,pad,tableW,titleH);
  ctx.fillStyle='#ffffff';ctx.font='bold 28px Arial';ctx.fillText('Liste des articles à facturer',pad+22,pad+48);
  ctx.fillStyle='#dbeafe';ctx.font='18px Arial';ctx.fillText(`Transport · ${fmtDate(e.date_envoi)}`,pad+22,pad+80);
  let y=pad+titleH;
  ctx.fillStyle='#eff6ff';ctx.fillRect(pad,y,tableW,metaH);
  ctx.fillStyle='#334155';ctx.font='bold 17px Arial';ctx.fillText(`N° d'envoi : ${e.numero_bl||'Sans numéro'}`,pad+18,y+32);
  ctx.fillText(`Transporteur : ${e.transporteur||'Non renseigné'}`,pad+18,y+66);
  y+=metaH;
  const headers=['Référence','Désignation','Unité','Quantité'];let x=pad;
  headers.forEach((h,i)=>{ctx.fillStyle='#2563eb';ctx.fillRect(x,y,widths[i],headH);ctx.strokeStyle='#1d4ed8';ctx.strokeRect(x,y,widths[i],headH);ctx.fillStyle='#fff';ctx.font='bold 17px Arial';ctx.textBaseline='middle';ctx.textAlign=i===2?'center':i===3?'right':'left';ctx.fillText(h,x+(i===2?widths[i]/2:i===3?widths[i]-14:12),y+headH/2);x+=widths[i];});
  y+=headH;
  prepared.forEach((r,ri)=>{x=pad;ctx.fillStyle=ri%2?'#eff6ff':'#ffffff';ctx.fillRect(pad,y,tableW,r.height);r.cells.forEach((v,i)=>{ctx.strokeStyle='#dbeafe';ctx.strokeRect(x,y,widths[i],r.height);ctx.fillStyle=i===0?'#1d4ed8':i===3?'#0f172a':'#334155';ctx.font=(i===0||i===3?'bold ':'')+'18px Arial';ctx.textBaseline='top';ctx.textAlign=i===2?'center':i===3?'right':'left';r.lines[i].forEach((line,j)=>ctx.fillText(line,x+(i===2?widths[i]/2:i===3?widths[i]-12:12),y+13+j*25));x+=widths[i];});y+=r.height;});
  // Tableau limité aux quatre colonnes demandées, sans ligne récapitulative.
  const caption=`Liste des articles à facturer pour le transport — ${e.numero_bl||fmtDate(e.date_envoi)} — ${e.transporteur||''}`;
  try {
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if (!blob) throw new Error('PNG indisponible');
    const file=new File([blob],`Liste-facturation-${(e.numero_bl||'envoi').replace(/[^a-z0-9_-]/gi,'_')}.png`,{type:'image/png'});
    if (navigator.canShare && navigator.canShare({files:[file]}) && navigator.share) {
      await navigator.share({files:[file],title:'Liste de facturation transport',text:caption});
    } else {
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
      window.open('https://wa.me/?text='+encodeURIComponent(caption+'\n\nJe joins le tableau détaillé en image.'),'_blank','noopener,noreferrer');
      toast('Image du tableau téléchargée. Joignez ce PNG dans WhatsApp pour conserver les couleurs.', 'warning');
    }
  } catch(err) {
    if (err && err.name==='AbortError') return;
    toast('Le partage direct n’est pas disponible. Utilisez Imprimer / PDF depuis l’aperçu.', 'warning');
  }
}
function sendExpeditionByWhatsApp(id) { openFinancialSharePreview(id, 'whatsapp'); }
function sendExpeditionByEmail(id) { openFinancialSharePreview(id, 'email'); }
function printExpedition(id) {
  const e = state.expeditions.find(x => x.id === id); if (!e) return;
  $('#printBL').textContent = e.numero_bl || 'SANS NUM'; $('#printDate').textContent = 'Date : ' + fmtDate(e.date_envoi);
  $('#printCarrier').textContent = 'Transporteur : ' + e.transporteur; $('#printObs').textContent = e.observations ? 'Note : ' + e.observations : '';
  let total = 0;
  $('#printBody').innerHTML = shipmentDisplayItems(e.items||[]).map(it => { total += cartonsOfItem(it); return `<tr><td style="font-family:monospace;font-weight:bold">${esc(it.reference||'-')}</td><td>${esc(it.categorie||'-')}</td><td>${esc(it.designation||'-')}</td><td style="font-weight:bold">${esc(it.destinataire||'STOCK')}</td><td style="text-align:center">${esc(it.unite||'UN')}</td><td style="text-align:right">${esc(it.quantite||'0')}</td><td style="text-align:center">${esc(it.cartons ?? '1')}</td></tr>`; }).join('');
  $('#printTotal').textContent = total; printLogiTrakDocument($('#printArea'));
}
function exportCSV() {
  const sep = ';', rows = [['Date','N° d\'envoi','Transporteur','Référence','Catégorie','Désignation','Destinataire','Unité','Quantité','Cartons','Observations']];
  state.expeditions.forEach(e => (e.items||[]).forEach(it => { rows.push([e.date_envoi, e.numero_bl, e.transporteur, it.reference, it.categorie, it.designation, it.destinataire, it.unite, it.quantite, it.cartons, (e.observations||'').replace(/;/g, ',')]); }));
  const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(sep)).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `Expeditions_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href); toast('Export CSV téléchargé.', 'success');
}

async function syncData(button) {
  button.disabled = true;
  try { await fetchData(); } finally { button.disabled = false; }
}

function apShipmentParts(quantity, spec, settings) {
  return apCartons(quantity,spec,settings).map(group=>({type:group.carton,nb:group.count,qte:group.ids,poids:group.grossKg??group.netKg}));
}
async function availableAPShipmentItems(orderId, includeDraft) {
  const [orders,runs]=await Promise.all([
    readLogiTrakRows(state.supabase,'ap_commandes','*'),
    readLogiTrakRows(state.supabase,'ap_productions'),
  ]);
  const byOrder=new Map(orders.map(order=>[order.id,order]));
  if(orderId&&!apProductSpec(byOrder.get(orderId)?.type_produit)) throw new Error('Commande Algérie Poste introuvable ou type de produit manquant.');
  const reserved=new Map();
  const add=(id,qty)=>{ if(id) reserved.set(id,(reserved.get(id)||0)+Number(qty||0)); };
  const editingId=includeDraft?$('#expId').value:'';
  for(const expedition of state.expeditions) {
    if(expedition.id===editingId) continue;
    for(const item of expedition.items) add(item.colisage_detail?.ap_production_id,item.quantite);
  }
  if(includeDraft) {
    for(const row of $$('#itemsBody tr')) add(getDetail(row)?.ap_production_id,row.querySelector('[data-field="quantite"]').value);
  }
  const items=[];
  for(const run of runs) {
    if(run.statut!=='TERMINE'||(orderId&&run.commande_id!==orderId)) continue;
    const order=byOrder.get(run.commande_id);
    const spec=apProductSpec(order?.type_produit);
    const remaining=run.quantite_imprimee-(reserved.get(run.id)||0);
    if(!spec||remaining<=0) continue;
    const settings={type_carton_ap:run.type_carton_ap,paquets_par_carton_ap:run.paquets_par_carton_ap,poids_paquet_ap:run.poids_paquet_ap};
    const parts=apShipmentParts(remaining,spec,settings);
    items.push({
      reference:spec.reference,categorie:'ALGERIE POSTE',designation:spec.label+' · Tirage '+run.numero_debut+' → '+run.numero_fin,
      destinataire:order.client,unite:'ID',quantite:String(remaining),cartons:parts.reduce((sum,part)=>sum+part.nb,0),
      colisage_detail:{ap_production_id:run.id,ap_pack:{orderId:order.id,orderNumber:order.ap_numero,type:order.type_produit,settings},parts},
    });
  }
  return items;
}
async function openAPShipment(orderId) {
  try {
    const items=await availableAPShipmentItems(orderId,false);
    if(!items.length) throw new Error('Aucun tirage validé disponible pour cette commande.');
    openExpeditionModal();
    $('#formObs').value='Algérie Poste · '+items[0].destinataire;
    $('#itemsBody').innerHTML='';
    items.forEach(addItemRow);
    updateModalTotals();
  } catch(error) { toast(error.message||'Impossible de charger la commande.','error'); }
}
async function openAPShipmentPicker() {
  if (!requireOperator()) return;
  try {
    const items=await availableAPShipmentItems(null,true);
    const orders=new Map();
    for(const item of items) {
      const id=item.colisage_detail.ap_pack.orderId;
      if(!orders.has(id)) orders.set(id,[]);
      orders.get(id).push(item);
    }
    if(!orders.size) return toast('Aucune commande Algérie Poste disponible en stock.','warning');
    const picker=$('#apOrderPicker');
    picker.hidden=false;
    picker.innerHTML='<label>Commande en stock<select class="inp"><option value="">Choisir une commande</option>'+
      [...orders].map(([id,lines])=>{
        const first=lines[0], total=lines.reduce((sum,item)=>sum+Number(item.quantite),0);
        return '<option value="'+esc(id)+'">'+esc((first.colisage_detail.ap_pack.orderNumber||'')+' · '+first.destinataire)+' · '+fmtNum(total)+' ID</option>';
      }).join('')+'</select></label><button type="button" class="btn btn-primary">Importer la commande</button>';
    const select=picker.querySelector('select');
    picker.querySelector('button').onclick=()=>{
      const selected=orders.get(select.value);
      if(!selected) return toast('Choisissez une commande.','warning');
      for(const row of $('#itemsBody tr')) {
        if(!row.querySelector('[data-field="reference"]').value.trim()&&!row.querySelector('[data-field="designation"]').value.trim()) row.remove();
      }
      selected.forEach(addItemRow);
      updateModalTotals();
      picker.hidden=true;
    };
    select.focus();
  } catch(error) { toast(error.message||'Impossible de charger les commandes.','error'); }
}

let requestedShipment = null;
async function openRequestedShipment() {
  const request = requestedShipment;
  if (!state.isOperator || !request) return;
  requestedShipment = null;
  if (request.apOrder) return openAPShipment(request.apOrder);
  openExpeditionModal();
  if (request.lots) await importLotsByIds(request.lots.split(',').filter(Boolean));
  if (request.carton) await importStockCartonById(request.carton);
}

document.addEventListener('DOMContentLoaded', async () => {
  syncThemeIcon(); if (window.Listes) { Listes.bind('#unitsList', 'unites'); Listes.bind('#categoriesList', 'categories'); } initSupabase(); try { if (state.supabase) await initAuth(); else await fetchData(); } catch (e) { console.warn(e); }
  // Depuis l'accueil : envois.html?new=1 ouvre directement la fenêtre « Nouvel envoi »
  const q = new URLSearchParams(location.search);
  if (q.has('new') || q.has('login') || q.has('admin')) history.replaceState(null, '', location.pathname);
  if (q.has('lots') || q.has('carton')) history.replaceState(null, '', location.pathname);
  if (q.get('new') === '1') {
    requestedShipment = { lots: q.get('lots'), carton: q.get('carton'), apOrder: q.get('commande-ap') };
    if (state.isOperator) await openRequestedShipment(); else requireOperator();
  }
  if (q.get('login') === '1') authAction();
  if (q.get('admin') === 'ops') openOperators();
  if (q.get('admin') === 'config') openAdmin();
});

/* ==========================================================
   IMPORT DEPUIS LA PRODUCTION (v21)
   - seuls les lots dont le colisage est rempli ET dont le reliquat est décidé peuvent partir
   - cartons calculés avec js/colisage-calc.js (cartons pleins + carton du reliquat choisi par l'opérateur)
   - reliquat « en stock » : il part dans un CARTON MIXTE (plusieurs références dans un seul carton)
   ========================================================== */
state.production = [];
state.stockCartons = [];

function reservedStockFor(lotId) {
  const available = state.stockCartons.reduce((sum, box) => sum + (+box.contenu[lotId] || 0), 0);
  return available + $$('#itemsBody tr').filter(row => row.dataset.prod === lotId && row.dataset.stockBox &&
    !state.stockCartons.some(box => box.id === row.dataset.stockBox)).reduce((sum, row) => sum + parseQty(row.querySelector('[data-field="quantite"]').value), 0);
}

// Quantités déjà expédiées d'un lot par les AUTRES envois (celui qu'on modifie est exclu) : cartons / carton mixte
function shippedSplit(lotId) {
  const editing = $('#expId').value; let n = 0, m = 0;
  state.expeditions.forEach(e => {
    if (e.id === editing) return;
    (e.items || []).forEach(it => {
      if (it.production_id !== lotId) return;
      if (it.colisage_detail && it.colisage_detail.mixte) m += parseQty(it.quantite); else n += parseQty(it.quantite);
    });
  });
  return { n, m };
}
// Quantités du lot déjà utilisées dans les lignes du formulaire en cours
function qtyInFormSplit(lotId) {
  let n = 0, m = 0;
  $$('#itemsBody tr').forEach(tr => {
    if (tr.dataset.prod !== lotId || tr.dataset.stockBox) return;
    const q = parseQty(tr.querySelector('[data-field="quantite"]').value);
    if (tr.dataset.mixte === '1') m += q; else n += q;
  });
  return { n, m };
}
function lotAvail(lot) {
  const s = shippedSplit(lot.id), f = qtyInFormSplit(lot.id);
  const reserved = reservedStockFor(lot.id);
  const total = Math.max(0, lot.quantite_produite - s.n - s.m - f.n - f.m - reserved);
  const av = window.LTColis.availability(lot, s.n + f.n, s.m + f.m, reserved);
  return state.isAdmin && (!lot.colisage_valide || av.blocked) ? { normal: total, mixte: 0, blocked: false } : av;
}
// Contrôles avant enregistrement : colisage validé, reliquat décidé, quantités <= reste, carton mixte <= 15 kg
async function checkProductionLimits(items) {
  const ids = [...new Set(items.map(i => i.production_id).filter(Boolean))];
  if (!ids.length || !state.supabase) return null;
  await loadAvailableStock();
  const { data, error } = await state.supabase.from('production').select('*').in('id', ids);
  if (error || !data) return null;
  for (const raw of data) {
    const lot = { ...raw, quantite_produite: +raw.quantite_produite, qte_par_carton: +raw.qte_par_carton || 1 };
    const label = `Lot ${lot.of_numero} (${lot.reference})`;
    if (!lot.colisage_valide) return `${label} : le colisage n'est pas rempli. Remplissez-le dans la page Colisage avant d'expédier.`;
    const s = shippedSplit(lot.id), av = window.LTColis.availability(lot, s.n, s.m, reservedStockFor(lot.id));
    if (av.blocked) return `${label} : le reliquat n'est pas décidé. Choisissez carton ou stock (page Production ou Colisage).`;
    const lines = items.filter(i => i.production_id === lot.id);
    const askN = lines.filter(i => !(i.colisage_detail && i.colisage_detail.mixte)).reduce((t, i) => t + parseQty(i.quantite), 0);
    const askM = lines.filter(i => i.colisage_detail && i.colisage_detail.mixte).reduce((t, i) => t + parseQty(i.quantite), 0);
    if (askN > av.normal) return `${label} : ${fmtNum(askN)} demandés en cartons, mais il n'en reste que ${fmtNum(av.normal)} à expédier.`;
    if (askM > av.mixte) return `${label} : ${fmtNum(askM)} demandés en carton mixte, mais il n'en reste que ${fmtNum(av.mixte)} en stock.`;
  }
  return null;
}

/* ----- Fenêtre « Importer depuis la production » ----- */
async function loadAvailableStock() {
  const { data } = await state.supabase.from('cartons_stock').select('*').is('expedition_id', null).order('created_at');
  state.stockCartons = data || [];
}

async function loadProductionLots() {
  await loadAvailableStock();
  const { data, error } = await state.supabase.from('production').select('*')
    .order('date_production', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  state.production = (data || []).map(l => ({
    ...l, quantite_produite: +l.quantite_produite, qte_par_carton: +l.qte_par_carton || 1, poids_carton: +l.poids_carton || 0,
    poids_bobine: +l.poids_bobine || 0, poids_carton_vide: +l.poids_carton_vide || 0, qte_reliquat: +l.qte_reliquat || 0,
  }));
}

state.apShipmentItems = [];
async function openProdPicker() {
  if (!requireOperator()) return;
  $('#ppSearch').value = '';
  $('#ppDest').value = '';
  $('#ppList').innerHTML = '<div class="p-8 text-center text-xs" style="color:var(--text-muted)">Chargement…</div>';
  openModal('prodPickerModal');
  try {
    await Promise.all([
      loadProductionLots(),
      availableAPShipmentItems(null, true).then(items => { state.apShipmentItems = items; }).catch(() => { state.apShipmentItems = []; })
    ]);
  } catch (e) {
    $('#ppList').innerHTML = '<div class="p-8 text-center text-xs" style="color:var(--text-muted)"><i class="fa-solid fa-database text-amber-500 text-2xl mb-2 block"></i>Le module Production n\'est pas à jour dans la base.<br>Exécutez <b>sql/v21-colisage-reference.sql</b> dans Supabase (SQL Editor).</div>';
    return;
  }
  renderProdPicker();
}

function packingFor(lot, qty) {
  return window.LTColis.packing({ ...lot, reliquat_carton: lot.reliquat_carton || lot.type_carton }, qty);
}

function renderProdPicker() {
  const items = state.production.map(lot => ({ lot, av: lotAvail(lot) })).filter(x => x.av.blocked || x.av.normal > 0 || x.av.mixte > 0 || (!state.isAdmin && !x.lot.colisage_valide));
  const open = items.filter(x => (x.lot.quantite_produite - (shippedSplit(x.lot.id).n + shippedSplit(x.lot.id).m)) > 0);
  const boxes = state.stockCartons.filter(box => !$$('#itemsBody tr').some(row => row.dataset.stockBox === box.id));
  const apItems = state.apShipmentItems || [];
  if (!open.length && !boxes.length && !apItems.length) {
    $('#ppList').innerHTML = '<div class="p-8 text-center text-xs" style="color:var(--text-muted)"><i class="fa-regular fa-folder-open text-3xl mb-2 block" style="color:var(--text-dim)"></i>Aucun lot à expédier.<br>Saisissez la production, puis remplissez le colisage de la référence.</div>';
    return;
  }
  const headOf = (lot, extra = '') => {
    const specs = [];
    if (lot.matiere) specs.push(lot.matiere);
    if (lot.gabarit || lot.dim_produit) specs.push(lot.gabarit || lot.dim_produit);
    if (lot.mandrin) specs.push('Mandrin ' + lot.mandrin);
    if (lot.etq_par_bobine > 0) specs.push(`${fmtNum(lot.etq_par_bobine)} étq/bob`);
    if (lot.type_produit === 'CARTE_PVC' && lot.cartes_par_paquet) specs.push(`Paquet de ${lot.cartes_par_paquet}`);
    return `<div class="flex-1 min-w-[200px]">
        <div class="flex items-center gap-2 flex-wrap"><span class="text-[11px] font-mono-code font-bold text-amber-500">OF ${esc(lot.of_numero)}</span>
          ${specs.length ? `<span class="text-[10px] px-2 py-0.5 rounded-full" style="background:var(--bg-input);color:var(--text-muted)">${esc(specs.join(' • '))}</span>` : ''}${extra}</div>
        <div class="text-xs mt-0.5"><span class="font-mono-code font-bold text-indigo-400">${esc(lot.reference || '-')}</span> <span class="font-semibold">${esc(lot.designation || '')}</span></div>`;
  };

  let normalHtml = '', mixteHtml = '';
  open.forEach(({ lot, av }) => {
    const search = [lot.of_numero, lot.reference, lot.designation, lot.categorie, lot.type_carton, lot.matiere].join(' ').toLowerCase();
    const tot = (lot.quantite_produite - (shippedSplit(lot.id).n + shippedSplit(lot.id).m));
    if (!lot.colisage_valide && !state.isAdmin) {
      const qs = new URLSearchParams({ ref: lot.reference || '', cat: lot.categorie || '', des: lot.designation || '', prod: lot.id });
      normalHtml += `<div class="pp-row panel-soft p-3 flex flex-wrap items-center gap-3" data-nocol="1" data-search="${esc(search)}" style="opacity:.85">${headOf(lot)}
        <div class="text-[11px]" style="color:var(--text-muted)">Dispo : <b>${fmtNum(tot)}</b> ${esc(lot.unite)} • <span class="text-amber-500 font-bold">colisage à remplir</span></div></div>
        <a href="colisage.html?${qs}" target="_blank" rel="noopener" class="btn btn-secondary"><i class="fa-solid fa-boxes-packing text-amber-500 text-xs"></i>Remplir le colisage</a></div>`;
      return;
    }
    if (av.blocked) {
      normalHtml += `<div class="pp-row panel-soft p-3 flex flex-wrap items-center gap-3" data-nocol="1" data-search="${esc(search)}" style="opacity:.85">${headOf(lot)}
        <div class="text-[11px]" style="color:var(--text-muted)">Dispo : <b>${fmtNum(tot)}</b> ${esc(lot.unite)} • <span class="text-amber-500 font-bold">reliquat de ${window.LTColis.remainderOf(lot)} à décider</span></div></div>
        <a href="colisage.html?prod=${encodeURIComponent(lot.id)}" target="_blank" rel="noopener" class="btn btn-secondary"><i class="fa-solid fa-circle-question text-amber-500 text-xs"></i>Décider le reliquat</a></div>`;
      return;
    }
    if (av.normal > 0) {
      const pk = packingFor(lot, av.normal);
      normalHtml += `<div class="pp-row panel-soft p-3 flex flex-wrap items-center gap-3" data-id="${esc(lot.id)}" data-search="${esc(search)}">
        <input type="checkbox" class="pp-check w-5 h-5 accent-indigo-500" aria-label="Sélectionner">
        ${headOf(lot)}
          <div class="text-[11px]" style="color:var(--text-muted)">Dispo : <b>${fmtNum(av.normal)}</b> ${esc(lot.unite)} • ${esc(lot.type_carton)} = ${lot.qte_par_carton} par carton${lot.reliquat_mode === 'STOCK' && window.LTColis.remainderOf(lot) ? ' • reliquat en stock' : ''}</div>
          <div class="text-[11px] font-bold text-amber-400 mt-0.5 pp-smart-detail">${pk ? esc(window.LTColis.text(pk.parts)) : ''}</div>
        </div>
        <div class="w-32"><label class="block text-[10px] font-bold mb-1" style="color:var(--text-muted)">Qté (${esc(lot.unite)})</label>
          <input class="inp text-right font-mono-code font-bold pp-qty" inputmode="numeric" pattern="[0-9]*" maxlength="9" value="${av.normal}" data-avail="${av.normal}"></div>
        <div class="w-24"><label class="block text-[10px] font-bold mb-1" style="color:var(--text-muted)">Cartons</label>
          <input type="number" min="1" step="1" class="inp text-center font-bold text-amber-400 pp-cartons" value="${pk ? pk.total : 1}"></div>
      </div>`;
    }
    if (av.mixte > 0) {
      mixteHtml += `<div class="pp-row pp-mix panel-soft p-3 flex flex-wrap items-center gap-3" data-id="${esc(lot.id)}" data-search="${esc(search)}">
        <input type="checkbox" class="pp-check w-5 h-5 accent-indigo-500" aria-label="Sélectionner">
        ${headOf(lot)}<div class="text-[11px]" style="color:var(--text-muted)">En stock : <b>${fmtNum(av.mixte)}</b> ${esc(lot.unite)}${lot.poids_bobine ? ' • ' + fmtKg(lot.poids_bobine) + ' kg l\'unité' : ''}</div></div>
        <div class="w-32"><label class="block text-[10px] font-bold mb-1" style="color:var(--text-muted)">Qté en carton mixte</label>
          <input class="inp text-right font-mono-code font-bold pp-qty" inputmode="numeric" pattern="[0-9]*" maxlength="9" value="${av.mixte}" data-avail="${av.mixte}"></div>
      </div>`;
    }
  });

  const boxHtml = boxes.map(box => {
    const content = Object.entries(box.contenu).map(([id, qty]) => {
      const lot = state.production.find(l => l.id === id);
      return (lot?.reference || lot?.of_numero || id) + ' × ' + qty;
    }).join(' · ');
    const label = 'Carton ' + box.type_carton + ' · ' + box.id.slice(0, 8).toUpperCase() + ' · ' + content;
    return '<label class="pp-row panel-soft p-3 flex gap-3 text-sm" data-stock-box="' + esc(box.id) + '" data-search="' + esc(label.toLowerCase()) + '"><input type="checkbox" class="pp-check"> ' + esc(label) + '</label>';
  }).join('');
  const apHtml = apItems.map((item, idx) => {
    const search = [item.reference, item.categorie, item.designation, item.destinataire].join(' ').toLowerCase();
    return `<div class="pp-row panel-soft p-3 flex flex-wrap items-center gap-3" data-ap-idx="${idx}" data-search="${esc(search)}">
      <input type="checkbox" class="pp-check w-5 h-5 accent-amber-500" aria-label="Sélectionner">
      <div class="flex-1 min-w-[200px]">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-[11px] font-mono-code font-bold text-amber-500">ALGÉRIE POSTE · ${esc(item.destinataire)}</span>
          <span class="text-[10px] px-2 py-0.5 rounded-full" style="background:var(--bg-input);color:var(--text-muted)">Regroupé par commande et type de carton</span>
        </div>
        <div class="text-xs mt-0.5"><span class="font-mono-code font-bold text-indigo-400">${esc(item.reference)}</span> <span class="font-semibold">${esc(item.designation)}</span></div>
        <div class="text-[11px]" style="color:var(--text-muted)">En stock : <b>${fmtNum(item.quantite)}</b> ID</div>
      </div>
      <div class="w-32"><label class="block text-[10px] font-bold mb-1" style="color:var(--text-muted)">Qté (ID)</label>
        <input class="inp text-right font-mono-code font-bold pp-qty" inputmode="numeric" pattern="[0-9]*" maxlength="9" value="${item.quantite}" data-avail="${item.quantite}"></div>
    </div>`;
  }).join('');
  $('#ppList').innerHTML =
    (apHtml ? `<div class="text-[11px] font-extrabold uppercase tracking-wider mb-2 text-amber-500"><i class="fa-solid fa-envelope-open-text mr-1.5"></i>Produits Algérie Poste colisés en stock</div><div class="space-y-2 mb-4">${apHtml}</div>` : '') +
    (boxHtml ? '<h4 class="text-xs font-bold">Cartons déjà composés en stock</h4>' + boxHtml : '') +
    ((normalHtml ? `<div class="text-[11px] font-extrabold uppercase tracking-wider mb-2" style="color:var(--text-muted)"><i class="fa-solid fa-box mr-1.5"></i>Lots à expédier en cartons</div><div class="space-y-2">${normalHtml}</div>` : '') +
    (mixteHtml ? `<div class="text-[11px] font-extrabold uppercase tracking-wider mt-5 mb-1" style="color:var(--text-muted)"><i class="fa-solid fa-warehouse mr-1.5"></i>Reliquats en stock — CARTON MIXTE</div>
       <p class="text-[11px] mb-2" style="color:var(--text-dim)">Les reliquats cochés ci-dessous partent ensemble dans <b>un carton mixte H2</b>. Pour choisir le type ou préparer plusieurs cartons, utilisez <b>Cartons en stock</b> dans Production. Limite de référence : ${window.LTColis.MAX_CARTON_KG} kg.</p><div class="space-y-2">${mixteHtml}</div>` : '') || (boxHtml || apHtml ? '' :
    '<div class="p-8 text-center text-xs" style="color:var(--text-muted)">Rien à expédier pour le moment.</div>'));
}

function filterProdPicker() {
  const q = $('#ppSearch').value.trim().toLowerCase();
  $$('#ppList .pp-row').forEach(r => { r.style.display = (!q || r.dataset.search.includes(q)) ? '' : 'none'; });
}
function toggleAllProdPicker() {
  const vis = $$('#ppList .pp-row').filter(r => r.style.display !== 'none' && !r.dataset.nocol);
  const allOn = vis.length && vis.every(r => r.querySelector('.pp-check').checked);
  vis.forEach(r => { r.querySelector('.pp-check').checked = !allOn; });
}

// Saisie dans la liste : entiers seulement, plafonnés au reste, cartons recalculés
document.addEventListener('input', e => {
  const row = e.target.closest && e.target.closest('#ppList .pp-row'); if (!row || row.dataset.nocol) return;
  const check = row.querySelector('.pp-check');
  if (e.target.classList.contains('pp-qty')) {
    const inp = e.target, avail = +inp.dataset.avail;
    let d = digitsOnly(inp.value);
    if (d !== inp.value) { inp.value = d; flashError(inp); }
    if ((+d || 0) > avail) { inp.value = String(avail); flashError(inp); d = String(avail); }
    if (!row.classList.contains('pp-mix')) {
      const lot = state.production.find(l => l.id === row.dataset.id);
      const pk = lot && packingFor(lot, d);
      const c = row.querySelector('.pp-cartons');
      if (c.dataset.manual !== '1' && pk) c.value = pk.total;
      const det = row.querySelector('.pp-smart-detail');
      if (det) det.textContent = pk ? window.LTColis.text(pk.parts) : '';
    }
    check.checked = true;
  } else if (e.target.classList.contains('pp-cartons')) {
    e.target.value = digitsOnly(e.target.value) || '1';
    e.target.dataset.manual = '1'; check.checked = true;
  }
});
// Reliquat « en stock » : la quantité en cartons doit remplir des cartons entiers
document.addEventListener('change', e => {
  const row = e.target.closest && e.target.closest('#ppList .pp-row'); if (!row || row.dataset.nocol || row.classList.contains('pp-mix')) return;
  if (!e.target.classList.contains('pp-qty')) return;
  const lot = state.production.find(l => l.id === row.dataset.id);
  if (!lot || String(lot.reliquat_mode || '') !== 'STOCK') return;
  const q = parseQty(e.target.value), qpc = lot.qte_par_carton, fixed = Math.floor(q / qpc) * qpc;
  if (fixed !== q) {
    e.target.value = String(fixed); flashError(e.target);
    toast(`Le reliquat reste en stock : la quantité est arrondie à des cartons entiers de ${qpc}.`, 'info');
    const pk = fixed > 0 ? packingFor(lot, fixed) : null, c = row.querySelector('.pp-cartons');
    if (c.dataset.manual !== '1' && pk) c.value = pk.total;
    const det = row.querySelector('.pp-smart-detail'); if (det) det.textContent = pk ? window.LTColis.text(pk.parts) : '';
  }
});

// Copie FIGÉE du colisage du lot : elle reste telle quelle dans l'envoi même si le lot est modifié plus tard
function lotDetail(lot) {
  return {
    produit: lot.type_produit || '', unite: lot.unite, etq_par_bobine: lot.etq_par_bobine || 0,
    cartes_par_paquet: lot.type_produit === 'CARTE_PVC' ? (lot.cartes_par_paquet || 0) : 0,
    mandrin: lot.mandrin || '', matiere: lot.matiere || '', gabarit: lot.gabarit || lot.dim_produit || '',
    poids_bobine: lot.poids_bobine || 0, poids_carton_vide: lot.poids_carton_vide || 0, poids_carton: lot.poids_carton || 0,
    type_carton: lot.type_carton, qpc: lot.qte_par_carton, reliquat_carton: lot.reliquat_carton || lot.type_carton,
  };
}

// Ajoute les lignes d'envoi pour des lots choisis. picked = [{lot, qty, cartons, manual, mixte}]
function addLotRows(picked, dest) {
  // on retire la ligne vide du départ
  $$('#itemsBody tr').forEach(tr => {
    const v = f => tr.querySelector(`[data-field="${f}"]`).value.trim();
    if (!v('reference') && !v('designation') && !parseQty(v('quantite')) && !tr.dataset.prod) tr.remove();
  });
  picked.forEach(p => {
    const base = lotDetail(p.lot);
    let detail, cartons;
    if (p.mixte) {
      detail = { ...base, mixte: true, qte: p.qty };
      if (p.box) Object.assign(detail, { stock_box_id: p.box.id, carton_mixte: p.box.type_carton, poids_bobine: LTColis.unitWeight(p.lot) });
      cartons = 0;
    } else {
      const pk = packingFor(p.lot, p.qty);
      detail = { ...base, parts: p.manual || !pk ? [] : pk.parts, manual: p.manual || !pk };
      cartons = p.manual || !pk ? p.cartons : pk.total;
    }
    addItemRow({
      reference: p.lot.reference, categorie: p.lot.categorie, designation: p.lot.designation,
      destinataire: dest || (p.box ? p.boxClient : p.lot.client) || 'STOCK', unite: p.lot.unite, quantite: String(p.qty), cartons, cartonsManual: !!detail.manual,
      production_id: p.lot.id, of_numero: p.lot.of_numero, colisage_detail: detail,
    });
  });
  updateModalTotals();
}

function importFromProduction() {
  const dest = $('#ppDest').value.trim().toUpperCase();
  const picked = [];
  let apAdded = 0;
  $$('#ppList .pp-row').forEach(row => {
    if (row.dataset.nocol || !row.querySelector('.pp-check').checked) return;
    if (row.dataset.apIdx !== undefined) {
      const item = (state.apShipmentItems || [])[Number(row.dataset.apIdx)];
      const quantity = parseQty(row.querySelector('.pp-qty').value);
      if (item && quantity >= 1 && quantity <= Number(item.quantite)) {
        $$('#itemsBody tr').forEach(tr => {
          const v = f => tr.querySelector(`[data-field="${f}"]`).value.trim();
          if (!v('reference') && !v('designation') && !parseQty(v('quantite')) && !tr.dataset.prod) tr.remove();
        });
        const detail = item.colisage_detail;
        const parts = apShipmentParts(quantity, apProductSpec(detail.ap_pack.type), detail.ap_pack.settings);
        addItemRow({
          ...item,
          quantite: String(quantity),
          cartons: parts.reduce((sum, part) => sum + part.nb, 0),
          colisage_detail: { ...detail, parts },
        });
        apAdded++;
      }
      return;
    }
    if (row.dataset.stockBox) {
      const box = state.stockCartons.find(b => b.id === row.dataset.stockBox);
      if (box) picked.push(...stockBoxLines(box));
      return;
    }
    const lot = state.production.find(l => l.id === row.dataset.id); if (!lot || (!lot.colisage_valide && !state.isAdmin)) return;
    const qty = parseQty(row.querySelector('.pp-qty').value);
    if (qty < 1) return;
    if (row.classList.contains('pp-mix')) { picked.push({ lot, qty, mixte: true }); return; }
    const cInp = row.querySelector('.pp-cartons');
    picked.push({ lot, qty, cartons: Math.max(1, parseInt(cInp.value) || 1), manual: cInp.dataset.manual === '1', mixte: false });
  });
  if (!picked.length && !apAdded) return toast('Cochez au moins un lot ou produit Algérie Poste avec une quantité.', 'warning');
  if (picked.length) addLotRows(picked, dest);
  updateModalTotals();
  closeModal('prodPickerModal');
  const nm = picked.filter(p => p.mixte).length;
  toast(`${picked.length + apAdded} ligne(s) ajoutée(s) à l'envoi${nm ? ` (dont ${nm} en carton mixte)` : ''}.`, 'success');
  if (!dest && picked.some(p => p.box && p.boxClient === 'STOCK')) toast('Vérifiez le destinataire des cartons mixtes.', 'info');
}

// Depuis la page Production : les lots cochés arrivent directement dans « Nouvel envoi » (quantité disponible en cartons)
function stockBoxLines(box) {
  const lines = Object.entries(box.contenu).map(([id, qty]) => ({ lot: state.production.find(l => l.id === id), qty, mixte: true, box }));
  if (lines.some(line => !line.lot)) return [];
  const clients = new Set(lines.map(line => line.lot.client || 'STOCK'));
  const boxClient = clients.size === 1 ? [...clients][0] : 'STOCK';
  return lines.map(line => ({ ...line, boxClient }));
}

async function importStockCartonById(id) {
  try { await loadProductionLots(); } catch (error) { return toast(error.message, 'error'); }
  const box = state.stockCartons.find(b => b.id === id);
  const lines = box ? stockBoxLines(box) : [];
  if (!lines.length) return toast('Carton indisponible. Rechargez le stock de production.', 'warning');
  addLotRows(lines, '');
  if (lines[0].boxClient === 'STOCK') toast('Vérifiez le destinataire du carton.', 'info');
}

async function importLotsByIds(ids) {
  try { await loadProductionLots(); } catch (e) { return toast('Production indisponible : exécutez sql/v21-colisage-reference.sql.', 'error'); }
  const picked = [], skipped = [];
  ids.forEach(id => {
    const lot = state.production.find(l => l.id === id); if (!lot) return;
    if (!lot.colisage_valide && !state.isAdmin) return skipped.push(`${lot.reference} (colisage à remplir)`);
    const av = lotAvail(lot);
    if (av.blocked) return skipped.push(`${lot.reference} (reliquat à décider)`);
    let qty = av.normal;
    if (lot.colisage_valide && !window.LTColis.needsDecision(lot) && lot.reliquat_mode === 'STOCK') qty = Math.floor(qty / lot.qte_par_carton) * lot.qte_par_carton;
    if (qty < 1) return skipped.push(`${lot.reference} (rien à expédier)`);
    picked.push({ lot, qty, cartons: 1, manual: false, mixte: false });
  });
  if (picked.length) { addLotRows(picked, ''); toast(`${picked.length} lot(s) ajouté(s) à l'envoi. Choisissez le destinataire de chaque ligne.`, 'success'); }
  if (skipped.length) toast('Non ajoutés : ' + skipped.join(', '), 'warning');
}
