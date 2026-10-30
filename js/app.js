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
let onlineChannel = null;
let onlineUsers = [];

let chartCategories = null;
let chartClients = null;
let chartProducts = null;

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k,v) => { try { localStorage.setItem(k,v); } catch {} };

function fmtDate(d) { if (!d) return '—'; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; }
function dayName(d) { try { return new Date(d+'T00:00').toLocaleDateString('fr-FR',{weekday:'short'}); } catch { return ''; } }
function dayNumber(d) { try { const p = d.split('-'); return p[2]+'/'+p[1]; } catch { return d; } }
function fmtNum(n) { return String(n ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

// Nettoie et extrait le nombre d'une chaîne ("1 500" -> 1500)
function parseQty(val) {
  if (!val) return 0;
  return parseInt(String(val).replace(/[^0-9]/g, ''), 10) || 0;
}

// Calcul intelligent du colisage sans virgule (avec gestion H2 -> H1 si reliquat <= moitié)
function computeSmartCarton(qty, qpc, fullBoxType = 'H2') {
  qty = Math.max(0, parseInt(qty) || 0);
  qpc = Math.max(1, parseInt(qpc) || 1);
  fullBoxType = (fullBoxType || 'H2').toUpperCase();
  if (qty === 0) return { cartons: 1, boxLabel: fullBoxType, detail: '' };
  const fullBoxes = Math.floor(qty / qpc);
  const remQty = qty % qpc;
  const cartons = Math.max(1, fullBoxes + (remQty > 0 ? 1 : 0)); // Toujours entier sans virgule
  let remBoxType = fullBoxType;
  if (remQty > 0 && remQty <= Math.floor(qpc / 2)) {
    remBoxType = (fullBoxType === 'H2') ? 'H1' : 'H1';
  }
  let boxLabel = fullBoxType;
  if (remQty > 0) {
    if (fullBoxes === 0) {
      boxLabel = remBoxType;
    } else if (remBoxType !== fullBoxType) {
      boxLabel = `${fullBoxes}×${fullBoxType} + 1×${remBoxType}`;
    } else {
      boxLabel = fullBoxType;
    }
  }
  const parts = [];
  if (fullBoxes > 0) parts.push(`${fullBoxes}×${fullBoxType} (${qpc})`);
  if (remQty > 0) parts.push(`1×${remBoxType} (${remQty})`);
  return { cartons, boxLabel, detail: parts.join(' + ') };
}

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
  if (state.expeditions.length) updateCharts();
}

function initSupabase() {
  const url = lsGet(CFG_URL) || SUPABASE_URL, key = lsGet(CFG_KEY) || SUPABASE_ANON;
  if ($('#sbUrl')) $('#sbUrl').value = url;
  if ($('#sbKey')) $('#sbKey').value = key;
  try {
    if (!window.supabase) throw new Error('SDK non chargé');
    state.supabase = window.supabase.createClient(url, key);
    setDbBadge('ok', 'Connecté');
  } catch (e) { setDbBadge('off', 'Hors ligne'); }
}
function setDbBadge(status, text) {
  const badge = $('#dbBadge'), dot = $('#dbDot'), ping = $('#dbPing'), txt = $('#dbText');
  if (!badge) return; 
  if (status === 'ok') { dot.className = 'relative inline-flex rounded-full h-2 w-2 bg-emerald-500'; ping.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75'; badge.style.color = '#34d399'; badge.style.borderColor = 'rgba(16,185,129,.4)'; }
  else if (status === 'syncing') { dot.className = 'relative inline-flex rounded-full h-2 w-2 bg-amber-500'; ping.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75'; badge.style.color = '#fbbf24'; badge.style.borderColor = 'rgba(245,158,11,.4)'; }
  else { dot.className = 'relative inline-flex rounded-full h-2 w-2 bg-slate-500'; ping.className = 'hidden'; badge.style.color = 'var(--text-muted)'; badge.style.borderColor = 'var(--border)'; }
  if (!state.isOperator) {
      txt.textContent = text;
  }
}

async function initAuth() {
  if (!state.supabase) return;
  const { data } = await state.supabase.auth.getSession();
  await refreshRole(data.session);
  state.supabase.auth.onAuthStateChange((_e, s) => setTimeout(() => refreshRole(s), 0));
}
async function refreshRole(session) {
  state.session = session; state.isOperator = false; state.isAdmin = false;
  if (session?.user?.email && state.supabase) {
    const username = session.user.email.split('@')[0];
    const { data, error } = await state.supabase.from('operateurs').select('role').eq('username', username).maybeSingle();
    if (data) { state.isOperator = true; state.isAdmin = data.role === 'admin'; }
  }
  document.body.classList.toggle('is-operator', state.isOperator);
  document.body.classList.toggle('is-admin', state.isAdmin);
  $('#authLabel').textContent = session ? session.user.email.split('@')[0] : 'Connexion';
  $('#authLabel').className = session ? 'hidden md:inline font-bold text-indigo-400' : 'hidden md:inline';
  if (state.expeditions.length) render();
  
  if (state.isOperator) {
    initPresence();
  } else if (onlineChannel) {
    state.supabase.removeChannel(onlineChannel);
    onlineChannel = null;
    $('#dbText').textContent = `Connecté`;
    $('#onlineUsersDropdown').classList.remove('open');
  }
}

function authAction() {
  if (state.session) { 
    confirmDialog('Se déconnecter ?').then(async yes => { 
      if (!yes) return;
      if (onlineChannel) { try { state.supabase.removeChannel(onlineChannel); } catch (e) {} onlineChannel = null; }
      // Déconnexion locale : fonctionne même si le réseau ou le serveur ne répond pas
      try { await state.supabase.auth.signOut({ scope: 'local' }); } catch (e) { console.warn(e); }
      // sécurité : on efface aussi la session gardée dans le navigateur
      try { Object.keys(localStorage).filter(k => /^sb-.*-auth-token/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
      await refreshRole(null);
      toast('Vous êtes déconnecté.', 'info');
    }); 
  }
  else { $('#loginMsg').classList.add('hidden'); openModal('loginModal'); }
}
async function doLogin(e) {
  e.preventDefault(); const msg = $('#loginMsg'); msg.classList.add('hidden');
  if (!state.supabase) return toast('Base indisponible', 'error');
  
  const username = $('#loginUsername').value.trim().toLowerCase();
  const email = username + '@logitrak.internal';

  const { error } = await state.supabase.auth.signInWithPassword({ email, password: $('#loginPassword').value });
  if (error) { msg.textContent = 'Pseudo ou mot de passe incorrect.'; msg.className = 'text-xs text-rose-400'; msg.classList.remove('hidden'); return; }
  
  $('#loginPassword').value = ''; closeModal('loginModal'); toast('Connexion réussie.', 'success');
}

function requireOperator() {
  if (state.isOperator && state.supabase) return true;
  toast("Connectez-vous pour effectuer cette action.", "warning");
  $('#loginMsg').classList.add('hidden'); openModal('loginModal');
  return false;
}

// --- GESTION DES UTILISATEURS EN LIGNE (PRESENCE) ---
function initPresence() {
  if (!state.supabase || !state.session) return;
  if (onlineChannel) { state.supabase.removeChannel(onlineChannel); onlineChannel = null; }

  const username = state.session.user.email.split('@')[0];
  onlineChannel = state.supabase.channel('online-users');

  onlineChannel
    .on('presence', { event: 'sync' }, () => {
      const newState = onlineChannel.presenceState();
      onlineUsers = [];
      for (const id in newState) {
        newState[id].forEach(presence => {
          if (!onlineUsers.some(u => u.username === presence.username)) {
            onlineUsers.push(presence);
          }
        });
      }
      $('#dbText').textContent = `👥 ${onlineUsers.length} en ligne`;
      renderOnlineUsersList();
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await onlineChannel.track({ username: username, online_at: new Date().toISOString() });
      }
    });
}

function toggleOnlineUsers(e) {
  e.stopPropagation();
  const dd = $('#onlineUsersDropdown');
  if (dd) dd.classList.toggle('open');
}

document.addEventListener('click', (e) => {
  const dd = $('#onlineUsersDropdown');
  if (dd && dd.classList.contains('open') && !e.target.closest('#dbBadge') && !e.target.closest('#onlineUsersDropdown')) {
    dd.classList.remove('open');
  }
});

function renderOnlineUsersList() {
  const list = $('#onlineUsersList');
  if (!list) return;
  
  if (!onlineUsers.length) {
    list.innerHTML = `<p class="text-xs text-center py-4 px-2" style="color:var(--text-muted)">Aucun autre utilisateur en ligne.</p>`;
  } else {
    list.innerHTML = onlineUsers.map(u => `
      <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--bg-hover)] transition">
        <div class="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
          ${esc(u.username.charAt(0).toUpperCase())}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold truncate">${esc(u.username)}</p>
        </div>
        <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></div>
      </div>
    `).join('');
  }
}
// ----------------------------------------------------

async function fetchData() {
  let loaded = false; setDbBadge('syncing', 'Synchro…');
  if (state.supabase) {
    try {
      const [exps, lines] = await Promise.all([
        state.supabase.from('expeditions').select('*').order('date_envoi', { ascending: false }),
        state.supabase.from('lignes_expedition').select('*').order('created_at', { ascending: true }),
      ]);
      if (exps.error) throw exps.error; if (lines.error) throw lines.error;
      state.expeditions = (exps.data || []).map(e => ({
        id: e.id, date_envoi: e.date_envoi, numero_bl: e.numero_bl || '', transporteur: e.transporteur || 'AUTRE',
        observations: e.observations || '', statut: e.statut || 'Expédié', created_at: e.created_at,
        items: (lines.data || []).filter(l => l.expedition_id === e.id).map(l => ({
          id: l.id, reference: l.reference || '', categorie: l.categorie || '', designation: l.designation || '', destinataire: l.destinataire || 'STOCK',
          unite: l.unite || 'UN', quantite: l.quantite || '0', cartons: l.cartons || 1,
          production_id: l.production_id || '', type_carton: l.type_carton || '', poids_carton: +l.poids_carton || 0, of_numero: l.of_numero || '',
        })),
      }));
      saveLocal(); setDbBadge('ok', `Connecté`); loaded = true;

      refMemory = {};
      const clients = new Set(['STOCK']);
      const carriers = new Set(['YAZID', 'YALIDINE', 'DJALAL', 'CLIENT', 'AUTRE']);
      const units = new Set(['BOBINE', 'UN', 'LOT', 'ID']);
      const categories = new Set(); // Nouveau : dictionnaire des catégories
      
      state.expeditions.forEach(e => {
        if (e.transporteur) carriers.add(e.transporteur.toUpperCase());
        (e.items||[]).forEach(it => {
          const ref = it.reference?.toUpperCase();
          const des = it.designation?.toUpperCase();
          const uni = it.unite?.toUpperCase();
          const cat = it.categorie?.toUpperCase();
          
          if (ref && des) refMemory[ref] = { designation: des, unite: uni || 'UN', categorie: cat || '' };
          if (it.destinataire) clients.add(it.destinataire.toUpperCase());
          if (uni) units.add(uni);
          if (cat) categories.add(cat); // Ajout à la liste des catégories
        });
      });
      
      if ($('#clientsList')) $('#clientsList').innerHTML = [...clients].map(c => `<option value="${esc(c)}">`).join('');
      if ($('#productsList')) $('#productsList').innerHTML = Object.keys(refMemory).map(r => `<option value="${esc(r)}" label="${esc(refMemory[r].designation)}">`).join('');
      if ($('#carriersList')) $('#carriersList').innerHTML = [...carriers].map(c => `<option value="${esc(c)}">`).join('');
      if ($('#unitsList')) $('#unitsList').innerHTML = [...units].map(u => `<option value="${esc(u)}">`).join('');
      if ($('#categoriesList')) $('#categoriesList').innerHTML = [...categories].map(c => `<option value="${esc(c)}">`).join(''); // Remplissage catégories

      // Chargement du référentiel de production / colisage pour pré-remplir par défaut les envois
      try {
        const { data: prodData } = await state.supabase.from('production').select('*').order('created_at', { ascending: false });
        if (prodData) {
          state.production = prodData.map(l => ({ ...l, quantite_produite: +l.quantite_produite, qte_par_carton: +l.qte_par_carton || 1, poids_carton: +l.poids_carton || 0 }));
          state.production.forEach(p => {
            const ref = (p.reference || '').toUpperCase();
            if (ref) {
              refMemory[ref] = {
                designation: (p.designation || refMemory[ref]?.designation || '').toUpperCase(),
                unite: (p.unite || refMemory[ref]?.unite || 'BOBINE').toUpperCase(),
                categorie: (p.categorie || refMemory[ref]?.categorie || '').toUpperCase(),
                qpc: +p.qte_par_carton || 1,
                type_carton: (p.type_carton || 'H2').toUpperCase(),
                poids_carton: +p.poids_carton || 0
              };
            }
          });
          if ($('#productsList')) $('#productsList').innerHTML = Object.keys(refMemory).map(r => `<option value="${esc(r)}" label="${esc(refMemory[r].designation)}">`).join('');
        }
      } catch (e) {}

    } catch (e) { setDbBadge('off', 'Hors ligne'); }
  } else { setDbBadge('off', 'Hors ligne'); }
  if (!loaded) { try { state.expeditions = JSON.parse(lsGet(LOCAL_KEY) || '[]'); } catch { state.expeditions = []; } }
  fillFilters(); applyFilters();
}
function saveLocal() { try { lsSet(LOCAL_KEY, JSON.stringify(state.expeditions)); } catch {} }

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

function render() {
  // --- Mise à jour des KPIs ---
  let cartons = 0, items = 0; const carriers = {};
  state.filtered.forEach(e => { carriers[e.transporteur] = (carriers[e.transporteur]||0) + 1; (e.items||[]).forEach(it => { items++; cartons += parseInt(it.cartons) || 1; }); });
  const top = Object.entries(carriers).sort((a,b) => b[1]-a[1])[0] || ['—', 0];
  $('#kpiDays').textContent = state.filtered.length; $('#kpiItems').textContent = items; $('#kpiCartons').textContent = cartons;
  $('#kpiCarrier').textContent = top[0]; $('#kpiCarrierShare').textContent = `${top[1]} départ(s)`;
  const y = $('#filterYear').value; $('#kpiYear').textContent = y === 'all' ? 'Toutes années' : y;

  updateCharts();

  const box = $('#dateView');
  if (!state.filtered.length) {
    box.innerHTML = `<div class="panel p-12 text-center" style="color:var(--text-muted)"><i class="fa-regular fa-folder-open text-4xl mb-3 block" style="color:var(--text-dim)"></i><h4 class="text-base font-bold" style="color:var(--text)">Aucun départ trouvé</h4><p class="text-xs mt-1">Aucune expédition ne correspond à vos filtres.</p><button onclick="resetFilters()" class="btn btn-primary mt-4"><i class="fa-solid fa-rotate-left"></i>Réinitialiser</button></div>`;
    return;
  }
  
  box.innerHTML = state.filtered.map(e => {
    const cartons = (e.items||[]).reduce((s,it) => s + (parseInt(it.cartons)||1), 0);
    const count = (e.items||[]).length, isExpanded = state.expanded.has(e.id);
    
    const isExpired = (new Date() - new Date(e.created_at)) > 48 * 3600 * 1000;
    const canEdit = state.isAdmin || !isExpired;
    const editBtn = canEdit 
      ? `<button onclick="openExpeditionModal('${esc(e.id)}')" class="op-only btn-icon" title="Modifier"><i class="fa-solid fa-pen-to-square text-amber-400"></i></button>
         <button onclick="deleteExpedition('${esc(e.id)}')" class="op-only btn-icon" title="Supprimer"><i class="fa-regular fa-trash-can text-rose-400"></i></button>`
      : `<button onclick="toast('Délai de 48h dépassé. Seul un admin peut modifier.','warning')" class="op-only btn-icon" title="Délai dépassé"><i class="fa-solid fa-lock text-slate-500"></i></button>`;

    return `
      <article class="panel overflow-hidden">
        <header class="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none" onclick="toggleAccordion('${esc(e.id)}')">
          <div class="flex items-center gap-4 min-w-0">
            <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex flex-col items-center justify-center flex-shrink-0">
              <span class="text-[9px] font-black uppercase leading-none">${esc(dayName(e.date_envoi))}</span><span class="text-sm font-black leading-none mt-1">${esc(dayNumber(e.date_envoi))}</span>
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2"><h3 class="font-extrabold text-sm sm:text-base">${esc(fmtDate(e.date_envoi))}</h3><span class="badge font-mono-code" style="background:rgba(99,102,241,.15);color:#a5b4fc;border-color:rgba(99,102,241,.3)">${esc(e.numero_bl || 'SANS NUM')}</span></div>
              <div class="flex flex-wrap items-center gap-2 mt-1 text-xs" style="color:var(--text-muted)"><span class="inline-flex items-center gap-1 font-semibold" style="color:var(--text)"><i class="fa-solid fa-truck text-indigo-400 text-[11px]"></i>${esc(e.transporteur)}</span><span>•</span><span class="font-bold text-amber-400"><i class="fa-solid fa-box text-[11px]"></i> ${cartons} carton(s)</span><span>•</span><span>${count} article(s)</span></div>
            </div>
          </div>
          <div class="flex items-center gap-2" onclick="event.stopPropagation()">
            <a href="colisage.html?id=${encodeURIComponent(e.id)}" class="btn-icon" title="Fiche de colisage"><i class="fa-solid fa-boxes-packing text-amber-500"></i></a>
            <button onclick="printExpedition('${esc(e.id)}')" class="btn-icon" title="Imprimer BL"><i class="fa-solid fa-print text-indigo-400"></i></button>
            <button onclick="sendExpeditionByEmail('${esc(e.id)}')" class="btn-icon" title="Préparer le tableau pour e-mail" aria-label="Préparer le tableau pour e-mail"><i class="fa-solid fa-envelope text-sky-400"></i></button>
            <button onclick="sendExpeditionByWhatsApp('${esc(e.id)}')" class="btn-icon" title="Partager le tableau par WhatsApp" aria-label="Partager le tableau par WhatsApp"><i class="fa-brands fa-whatsapp text-emerald-400"></i></button>
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
                ${(e.items||[]).map(it => `<tr class="hover:bg-[var(--bg-hover)] transition"><td class="p-3 pl-5 font-mono-code font-bold text-indigo-400">${esc(it.reference || '-')}</td><td class="p-3 text-slate-400 font-semibold text-xs uppercase">${esc(it.categorie || '-')}</td><td class="p-3 font-semibold">${esc(it.designation || '-')}</td><td class="p-3"><span class="badge ${it.destinataire==='STOCK'?'badge-stock':'badge-client'}">${esc(it.destinataire || 'STOCK')}</span></td><td class="p-3 text-center font-mono-code" style="color:var(--text-muted)">${esc(it.unite || 'UN')}</td><td class="p-3 text-right font-mono-code font-bold">${fmtNum(it.quantite)}</td><td class="p-3 text-center font-bold text-amber-400">${esc(it.cartons || '1')}</td></tr>`).join('') || '<tr><td colspan="7" class="p-4 text-center text-xs" style="color:var(--text-muted)">Aucun article</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </article>`;
  }).join('');

  const body = $('#tableBody'); let html = '';
  state.filtered.forEach(e => (e.items||[]).forEach(it => {
    html += `<tr class="hover:bg-[var(--bg-hover)] transition"><td class="p-3 pl-5 font-bold whitespace-nowrap">${esc(fmtDate(e.date_envoi))}</td><td class="p-3 font-mono-code text-indigo-400">${esc(e.numero_bl || '-')}</td><td class="p-3 font-semibold">${esc(e.transporteur)}</td><td class="p-3 font-mono-code font-bold text-indigo-400">${esc(it.reference || '-')}</td><td class="p-3 font-semibold text-slate-400 text-xs uppercase">${esc(it.categorie || '-')}</td><td class="p-3">${esc(it.designation || '-')}</td><td class="p-3"><span class="badge ${it.destinataire==='STOCK'?'badge-stock':'badge-client'}">${esc(it.destinataire || 'STOCK')}</span></td><td class="p-3 text-center" style="color:var(--text-muted)">${esc(it.unite || 'UN')}</td><td class="p-3 text-right font-mono-code font-bold">${fmtNum(it.quantite)}</td><td class="p-3 text-center font-bold text-amber-400">${esc(it.cartons || '1')}</td><td class="p-3 text-xs truncate max-w-xs" style="color:var(--text-muted)">${esc(e.observations || '-')}</td></tr>`;
  }));
  body.innerHTML = html || `<tr><td colspan="11" class="p-8 text-center text-xs" style="color:var(--text-muted)">Aucune expédition</td></tr>`;
}

// --- Mise à jour des Graphiques ---
function makeHBar(canvasId, entries, label, color, fontSize, textColor, gridColor) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(d => d[0]),
      datasets: [{ label, data: entries.map(d => d[1]), backgroundColor: color, borderRadius: 6 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { ticks: { color: textColor, font: { size: fontSize } }, grid: { display: false } }
      }
    }
  });
}

function isAlgeriePosteItem(it) {
  const txt = `${it.destinataire || ''} ${it.categorie || ''} ${it.designation || ''} ${it.reference || ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return txt.includes('ALGERIE POSTE') || txt.includes('POSTE') || /\bUPW\b/.test(txt) || /\bAP\b/.test(txt);
}

function updateCharts() {
  const isLight = document.documentElement.classList.contains('light');
  const textColor = isLight ? '#475569' : '#94a3b8';
  const gridColor = isLight ? '#94a3b8' : '#334155';

  const colors = {
    purple: 'rgba(139, 92, 246, 0.8)',
    cyan: 'rgba(6, 182, 212, 0.8)',
    emerald: 'rgba(16, 185, 129, 0.8)',
    amber: 'rgba(245, 158, 11, 0.8)',
  };

  const apCategoryData = {}; // Top 5 Destinataires Algérie Poste sur l'année
  const clientData = {};     // Top 5 Clients hors Algérie Poste (et hors STOCK) sur l'année
  const productData = {};    // Top 5 Produits (tout produit) hors Algérie Poste sur l'année

  const selectedYear = ($('#statsYear') && $('#statsYear').value)
    || ($('#filterYear') && $('#filterYear').value !== 'all' ? $('#filterYear').value : String(new Date().getFullYear()));
  const startDate = `${selectedYear}-01-01`;
  const endDate   = `${selectedYear}-12-31`;

  if ($('#statsPeriodLabel')) {
    $('#statsPeriodLabel').textContent = `Du 01/01/${selectedYear} au 31/12/${selectedYear}`;
  }

  // Filtrage strict sur l'année civile du 1er janvier au 31 décembre
  const annualExpeditions = state.expeditions.filter(e => {
    const d = String(e.date_envoi || '').slice(0, 10);
    return d >= startDate && d <= endDate;
  });

  annualExpeditions.forEach(e => {
    (e.items || []).forEach(it => {
      const q = parseQty(it.quantite);
      if (q <= 0) return;
      const dest = String(it.destinataire || 'STOCK').trim().toUpperCase();
      const cat = String(it.categorie || '').trim().toUpperCase();
      const prodName = (it.reference ? it.reference + ' - ' : '') + (it.designation || 'SANS NOM');
      const isAP = isAlgeriePosteItem(it);

      if (isAP) {
        // Top 5 Catégorie Algérie Poste classé entre les Destinataires de ce produit (hors STOCK)
        if (dest && dest !== 'STOCK') {
          apCategoryData[dest] = (apCategoryData[dest] || 0) + q;
        }
      } else {
        // Hors Algérie Poste : Clients (hors STOCK) & Produits (tous produits confondus)
        if (dest && dest !== 'STOCK') {
          clientData[dest] = (clientData[dest] || 0) + q;
        }
        productData[prodName] = (productData[prodName] || 0) + q;
      }
    });
  });

  const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

  [chartCategories, chartClients, chartProducts].forEach(c => { if (c) c.destroy(); });

  chartCategories = makeHBar('chartCategories', top(apCategoryData, 5), 'Quantité AP', colors.purple,  10, textColor, gridColor);
  chartClients    = makeHBar('chartClients',    top(clientData, 5),     'Quantité',    colors.emerald, 10, textColor, gridColor);
  chartProducts   = makeHBar('chartProducts',   top(productData, 5),    'Quantité',    colors.amber,   10, textColor, gridColor);
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
  const active = 'px-3 py-1.5 rounded-lg text-xs font-bold transition bg-indigo-600 text-white', idle = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition';
  if (v === 'date') { dateBox.classList.remove('hidden'); tableBox.classList.add('hidden'); bD.className = active; bT.className = idle; bT.style.color = 'var(--text-muted)'; }
  else { dateBox.classList.add('hidden'); tableBox.classList.remove('hidden'); bT.className = active; bT.style.color = ''; bD.className = idle; bD.style.color = 'var(--text-muted)'; }
}
function resetFilters() { $('#searchInput').value = ''; $('#filterYear').value = 'all'; $('#filterCarrier').value = 'all'; $('#filterDest').value = 'all'; applyFilters(); }

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
  if (!requireOperator()) return;
  const isEdit = !!id, exp = isEdit ? state.expeditions.find(e => e.id === id) : null;
  if (isEdit && !exp) return;
  
  if (isEdit) {
    const isExpired = (new Date() - new Date(exp.created_at)) > 48 * 3600 * 1000;
    if (isExpired && !state.isAdmin) return toast("Modification impossible : délai de 48h dépassé.", "error");
  }

  $('#expId').value = isEdit ? exp.id : '';
  $('#expTitle').textContent = isEdit ? `Modifier l'envoi du ${fmtDate(exp.date_envoi)}` : 'Nouvel envoi';
  const today = new Date().toISOString().slice(0,10);
  $('#formDate').value = isEdit ? exp.date_envoi : today;
  $('#formBL').value = isEdit ? (exp.numero_bl || '') : nextNumEnvoi(today);
  $('#formCarrier').value = isEdit ? exp.transporteur : 'YAZID';
  $('#formObs').value = isEdit ? (exp.observations || '') : '';
  
  $('#formDate').onchange = (e) => {
    if (!isEdit && e.target.value) {
      $('#formBL').value = nextNumEnvoi(e.target.value);
    }
  };

  $('#itemsBody').innerHTML = ''; (isEdit ? exp.items : [{}]).forEach(it => addItemRow(it));
  updateModalTotals(); openModal('expeditionModal');
}
function addItemRow(item = {}) {
  const rowId = 'r' + (++rowCounter), tr = document.createElement('tr'); tr.dataset.rowId = rowId;
  tr.innerHTML = `
    <td class="p-2"><input class="inp font-mono-code input-uppercase" data-field="reference" list="productsList" value="${esc(item.reference||'')}" placeholder="📷 Réf" title="Toucher la case vide pour scanner un code-barres ou DataMatrix"><div data-prodtag class="text-[10px] mt-1 font-bold text-amber-500 ${item.of_numero ? '' : 'hidden'}">${item.of_numero ? 'OF ' + esc(item.of_numero) + (item.type_carton ? ' • carton ' + esc(item.type_carton) : '') : ''}</div></td>
    <td class="p-2"><input class="inp input-uppercase" data-field="categorie" list="categoriesList" value="${esc(item.categorie||'')}" placeholder="Catégorie"></td> <!-- NOUVEAU -->
    <td class="p-2"><input class="inp input-uppercase" data-field="designation" value="${esc(item.designation||'')}" placeholder="Désignation"></td>
    <td class="p-2"><input class="inp input-uppercase" data-field="destinataire" list="clientsList" value="${esc(item.destinataire||'STOCK')}"></td>
    <td class="p-2"><input class="inp text-center input-uppercase" data-field="unite" list="unitsList" value="${esc(item.unite||'UN')}"></td>
    <td class="p-2"><input class="inp text-right font-mono-code" data-field="quantite" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="9" placeholder="0" title="Nombre entier uniquement (sans virgule)" value="${esc(digitsOnly(item.quantite))}"></td>
    <td class="p-2"><input class="inp text-center font-bold text-amber-400" data-field="cartons" type="number" min="1" value="${esc(item.cartons||'1')}"></td>
    <td class="p-2 text-center"><button type="button" class="btn-icon" data-remove aria-label="Supprimer"><i class="fa-solid fa-xmark text-rose-400 text-xs"></i></button></td>`;
  $('#itemsBody').appendChild(tr);
  // Données issues de la production (lien, OF, carton, poids)
  tr.dataset.prod = item.production_id || '';
  tr.dataset.of = item.of_numero || '';
  tr.dataset.baseCarton = item.base_carton || item.type_carton || 'H2';
  tr.dataset.carton = item.type_carton || '';
  tr.dataset.poids = item.poids_carton || 0;
  tr.dataset.qpc = item.qpc || '';
  tr.dataset.linkRef = String(item.reference || '').toUpperCase();
  if (item.cartonsManual) tr.dataset.cartonsManual = '1';

  const refreshRowPacking = (qtyVal) => {
    const qpc = parseInt(tr.dataset.qpc) || 0;
    if (!qpc) return;
    const smart = computeSmartCarton(parseInt(qtyVal) || 0, qpc, tr.dataset.baseCarton || 'H2');
    if (tr.dataset.cartonsManual !== '1') {
      tr.querySelector('[data-field="cartons"]').value = smart.cartons;
    }
    tr.dataset.carton = smart.boxLabel;
    const tg = tr.querySelector('[data-prodtag]');
    if (tg) {
      const ofTxt = tr.dataset.of ? `OF ${tr.dataset.of} • ` : '';
      tg.textContent = `${ofTxt}${smart.detail || ('carton ' + smart.boxLabel)}`;
      tg.classList.remove('hidden');
    }
  };

  tr.querySelector('[data-field="cartons"]').addEventListener('input', (e) => {
    const cleanC = digitsOnly(e.target.value);
    e.target.value = cleanC || '1';
    tr.dataset.cartonsManual = '1';
    updateModalTotals();
  });
  const qtyInput = tr.querySelector('[data-field="quantite"]');
  qtyInput.addEventListener('input', () => {
    const clean = digitsOnly(qtyInput.value);
    if (clean !== qtyInput.value) { qtyInput.value = clean; flashError(qtyInput); }
    qtyInput.classList.remove('inp-error');
    refreshRowPacking(clean);
    updateModalTotals();
  });
  tr.querySelector('[data-remove]').addEventListener('click', () => { tr.remove(); updateModalTotals(); });
  
  const refInput = tr.querySelector('[data-field="reference"]');
  const catInput = tr.querySelector('[data-field="categorie"]');
  const desInput = tr.querySelector('[data-field="designation"]');
  const unitInput = tr.querySelector('[data-field="unite"]');
  
  // Si l'utilisateur change la référence d'une ligne importée, le lien avec la production est coupé
  refInput.addEventListener('input', () => {
    if (tr.dataset.prod && refInput.value.trim().toUpperCase() !== tr.dataset.linkRef) {
      tr.dataset.prod = ''; tr.dataset.of = ''; tr.dataset.carton = ''; tr.dataset.poids = '0'; tr.dataset.qpc = '';
      const tg = tr.querySelector('[data-prodtag]'); if (tg) tg.classList.add('hidden');
    }
  });
  // Auto-complétion étendue à la catégorie et au colisage par défaut du produit
  refInput.addEventListener('change', (e) => {
    const ref = e.target.value.trim().toUpperCase();
    if (ref && refMemory[ref]) {
      desInput.value = refMemory[ref].designation;
      if (unitInput) unitInput.value = refMemory[ref].unite;
      if (catInput && refMemory[ref].categorie) catInput.value = refMemory[ref].categorie;
      if (refMemory[ref].qpc) {
        tr.dataset.qpc = refMemory[ref].qpc;
        tr.dataset.baseCarton = refMemory[ref].type_carton || 'H2';
        tr.dataset.poids = refMemory[ref].poids_carton || 0;
        refreshRowPacking(qtyInput.value);
        updateModalTotals();
      }
    }
  });
  if (tr.dataset.qpc) refreshRowPacking(qtyInput.value);

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
function updateModalTotals() {
  const rows = $$('#itemsBody tr'); let total = 0; rows.forEach(tr => total += parseInt(tr.querySelector('[data-field="cartons"]').value) || 1);
  $('#modalTotal').textContent = `Total : ${total} carton(s)`; $('#itemsCount').textContent = `${rows.length}`;
}
function collectItems() {
  return $$('#itemsBody tr').map(tr => {
    const get = f => tr.querySelector(`[data-field="${f}"]`).value.trim().toUpperCase();
    return { reference: get('reference'), categorie: get('categorie'), designation: get('designation'), destinataire: get('destinataire') || 'STOCK', unite: get('unite') || 'UN', quantite: String(parseInt(digitsOnly(get('quantite')), 10) || 0), cartons: parseInt(get('cartons')) || 1,
      production_id: tr.dataset.prod || '', type_carton: tr.dataset.carton || '', poids_carton: parseFloat(tr.dataset.poids) || 0, of_numero: tr.dataset.of || '' };
  }).filter(it => it.reference || it.designation);
}
async function saveExpedition() {
  if (!requireOperator()) return;
  const dateVal = $('#formDate').value; if (!dateVal) return toast("Date d'expédition requise.", "error");
  const items = collectItems(); if (!items.length) return toast("Renseignez au moins un article.", "error");
  const badQty = firstBadQuantity();
  if (badQty) { badQty.classList.add('inp-error'); badQty.focus(); return toast("Quantité invalide : saisissez un nombre entier supérieur à 0 (sans virgule).", "error"); }
  
  const limitErr = await checkProductionLimits(items);
  if (limitErr) return toast(limitErr, "error");
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
    if (error) throw error; toast('Envoi enregistré.', 'success');
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
  lsSet(CFG_URL, url); lsSet(CFG_KEY, key); initSupabase(); initAuth(); fetchData(); closeModal('adminModal'); toast('Configuration enregistrée.', 'success');
}

async function openOperators() { if (!state.isAdmin) return; openModal('opsModal'); await loadOperators(); }
async function loadOperators() {
  const box = $('#opsList'); const { data, error } = await state.supabase.from('operateurs').select('*').order('created_at');
  if (error) return box.innerHTML = `<p class="py-3 text-rose-400">${esc(error.message)}</p>`;
  const me = (state.session?.user?.email || '').split('@')[0];
  box.innerHTML = (data||[]).map(o => `
    <div class="py-2.5 flex items-center justify-between gap-2"><div class="min-w-0"><p class="font-semibold truncate">${esc(o.username)}</p><p class="text-[11px]" style="color:var(--text-muted)">${o.role === 'admin' ? 'Administrateur' : 'Opérateur'}</p></div>
    ${o.username === me ? '<span class="text-[11px]" style="color:var(--text-dim)">vous</span>' : `<button onclick="removeOperator('${esc(o.username)}')" class="btn btn-secondary"><i class="fa-solid fa-trash text-rose-400"></i>Retirer</button>`}</div>`).join('') || '<p class="py-3 text-xs" style="color:var(--text-muted)">Aucun opérateur.</p>';
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
  if (!await confirmDialog(`Retirer l'accès à ${username} ?`)) return;
  const { error } = await state.supabase.from('operateurs').delete().eq('username', username);
  if (error) return toast('Retrait impossible : ' + error.message, 'error');
  toast('Accès retiré.', 'success'); await loadOperators();
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
  $('#printBody').innerHTML = (e.items||[]).map(it => { total += parseInt(it.cartons) || 1; return `<tr><td style="font-family:monospace;font-weight:bold">${esc(it.reference||'-')}</td><td>${esc(it.categorie||'-')}</td><td>${esc(it.designation||'-')}</td><td style="font-weight:bold">${esc(it.destinataire||'STOCK')}</td><td style="text-align:center">${esc(it.unite||'UN')}</td><td style="text-align:right">${esc(it.quantite||'0')}</td><td style="text-align:center">${esc(it.cartons||'1')}</td></tr>`; }).join('');
  $('#printTotal').textContent = total; window.print();
}
function exportCSV() {
  const sep = ';', rows = [['Date','N° d\'envoi','Transporteur','Référence','Catégorie','Désignation','Destinataire','Unité','Quantité','Cartons','Observations']];
  state.expeditions.forEach(e => (e.items||[]).forEach(it => { rows.push([e.date_envoi, e.numero_bl, e.transporteur, it.reference, it.categorie, it.designation, it.destinataire, it.unite, it.quantite, it.cartons, (e.observations||'').replace(/;/g, ',')]); }));
  const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(sep)).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `Expeditions_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href); toast('Export CSV téléchargé.', 'success');
}

async function syncData() {
  const btn = event?.currentTarget; btn?.classList.add('animate-spin'); await fetchData(); setTimeout(() => btn?.classList.remove('animate-spin'), 400);
}

document.addEventListener('DOMContentLoaded', async () => {
  syncThemeIcon(); initSupabase(); await fetchData(); try { await initAuth(); } catch (e) { console.warn(e); }
  // Depuis l'accueil : envois.html?new=1 ouvre directement la fenêtre « Nouvel envoi »
  const q = new URLSearchParams(location.search);
  if (q.has('new') || q.has('login') || q.has('admin')) history.replaceState(null, '', location.pathname);
  if (q.get('new') === '1') openExpeditionModal();
  if (q.get('login') === '1') authAction();
  if (q.get('admin') === 'ops') openOperators();
  if (q.get('admin') === 'config') openAdmin();
});

/* ==========================================================
   IMPORT DEPUIS LA PRODUCTION
   ========================================================== */
state.production = [];

// Quantité déjà expédiée pour un lot, par les AUTRES envois (celui qu'on modifie est exclu)
function shippedByOthers(lotId) {
  const editing = $('#expId').value; let sum = 0;
  state.expeditions.forEach(e => {
    if (e.id === editing) return;
    (e.items || []).forEach(it => { if (it.production_id === lotId) sum += parseQty(it.quantite); });
  });
  return sum;
}
// Quantité du lot déjà utilisée dans les lignes du formulaire en cours
function qtyInForm(lotId) {
  let sum = 0;
  $$('#itemsBody tr').forEach(tr => { if (tr.dataset.prod === lotId) sum += parseQty(tr.querySelector('[data-field="quantite"]').value); });
  return sum;
}
// Empêche d'expédier plus que ce qui reste du lot
async function checkProductionLimits(items) {
  const ids = [...new Set(items.map(i => i.production_id).filter(Boolean))];
  if (!ids.length || !state.supabase) return null;
  const { data, error } = await state.supabase.from('production').select('id,of_numero,reference,quantite_produite').in('id', ids);
  if (error || !data) return null;
  for (const lot of data) {
    const asked = items.filter(i => i.production_id === lot.id).reduce((s, i) => s + parseQty(i.quantite), 0);
    const rest = Math.max(0, lot.quantite_produite - shippedByOthers(lot.id));
    if (asked > rest) return `Lot ${lot.of_numero} (${lot.reference}) : ${fmtNum(asked)} demandés, mais il ne reste que ${fmtNum(rest)} à expédier.`;
  }
  return null;
}

async function openProdPicker() {
  if (!requireOperator()) return;
  $('#ppSearch').value = '';
  $('#ppList').innerHTML = '<div class="p-8 text-center text-xs" style="color:var(--text-muted)">Chargement…</div>';
  openModal('prodPickerModal');
  try {
    const { data, error } = await state.supabase.from('production').select('*')
      .order('date_production', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;
    state.production = (data || []).map(l => ({ ...l, quantite_produite: +l.quantite_produite, qte_par_carton: +l.qte_par_carton || 1, poids_carton: +l.poids_carton || 0 }));
  } catch (e) {
    $('#ppList').innerHTML = '<div class="p-8 text-center text-xs" style="color:var(--text-muted)"><i class="fa-solid fa-database text-amber-500 text-2xl mb-2 block"></i>Le module Production n\'est pas encore installé dans la base.<br>Exécutez le fichier <b>sql/production.sql</b> dans Supabase (SQL Editor).</div>';
    return;
  }
  renderProdPicker();
}

function renderProdPicker() {
  const rows = state.production.map(lot => {
    const avail = lot.quantite_produite - shippedByOthers(lot.id) - qtyInForm(lot.id);
    return { lot, avail };
  }).filter(x => x.avail > 0);

  if (!rows.length) {
    $('#ppList').innerHTML = '<div class="p-8 text-center text-xs" style="color:var(--text-muted)"><i class="fa-regular fa-folder-open text-3xl mb-2 block" style="color:var(--text-dim)"></i>Aucun lot à expédier.<br>Saisissez d\'abord la production dans la page <b>Production</b>.</div>';
    return;
  }
  $('#ppList').innerHTML = rows.map(({ lot, avail }) => {
    const search = [lot.of_numero, lot.reference, lot.designation, lot.categorie, lot.type_carton, lot.matiere].join(' ').toLowerCase();
    const fullBox = (lot.type_carton || 'H2').toUpperCase();
    const smart = computeSmartCarton(avail, lot.qte_par_carton, fullBox);
    const specs = [];
    if (lot.matiere) specs.push(lot.matiere);
    if (lot.mandrin) specs.push('Mandrin ' + lot.mandrin);
    if (lot.etq_par_bobine > 0) specs.push(`${fmtNum(lot.etq_par_bobine)} étq/bob`);
    if (lot.unite === 'LOT' && lot.cartes_par_paquet) specs.push(`Paquet de ${lot.cartes_par_paquet}`);
    return `<div class="pp-row panel-soft p-3 flex flex-wrap items-center gap-3" data-id="${esc(lot.id)}" data-search="${esc(search)}" data-box="${esc(fullBox)}">
      <input type="checkbox" class="pp-check w-5 h-5 accent-indigo-500" aria-label="Sélectionner">
      <div class="flex-1 min-w-[200px]">
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-mono-code font-bold text-amber-500">OF ${esc(lot.of_numero)}</span>
          ${specs.length ? `<span class="text-[10px] px-2 py-0.5 rounded-full" style="background:var(--bg-input);color:var(--text-muted)">${esc(specs.join(' • '))}</span>` : ''}
        </div>
        <div class="text-xs mt-0.5"><span class="font-mono-code font-bold text-indigo-400">${esc(lot.reference || '-')}</span> <span class="font-semibold">${esc(lot.designation || '')}</span></div>
        <div class="text-[11px]" style="color:var(--text-muted)">Dispo : <b>${fmtNum(avail)}</b> ${esc(lot.unite)} • Colisage défaut : <b>${fmtNum(lot.qte_par_carton)} ${esc(lot.unite)}/${esc(fullBox)}</b>${lot.poids_carton ? ' • ' + lot.poids_carton + ' kg' : ''}</div>
        <div class="text-[11px] font-bold text-amber-400 mt-0.5 pp-smart-detail">${esc(smart.detail)}</div>
      </div>
      <div class="w-32"><label class="block text-[10px] font-bold mb-1" style="color:var(--text-muted)">Qté (${esc(lot.unite)})</label>
        <input class="inp text-right font-mono-code font-bold pp-qty" inputmode="numeric" pattern="[0-9]*" maxlength="9" value="${avail}" data-avail="${avail}" data-qpc="${lot.qte_par_carton}"></div>
      <div class="w-24"><label class="block text-[10px] font-bold mb-1" style="color:var(--text-muted)">Cartons (Entier)</label>
        <input type="number" min="1" step="1" class="inp text-center font-bold text-amber-400 pp-cartons" value="${smart.cartons}"></div>
    </div>`;
  }).join('');
}

function filterProdPicker() {
  const q = $('#ppSearch').value.trim().toLowerCase();
  $$('#ppList .pp-row').forEach(r => { r.style.display = (!q || r.dataset.search.includes(q)) ? '' : 'none'; });
}
function toggleAllProdPicker() {
  const vis = $$('#ppList .pp-row').filter(r => r.style.display !== 'none');
  const allOn = vis.length && vis.every(r => r.querySelector('.pp-check').checked);
  vis.forEach(r => { r.querySelector('.pp-check').checked = !allOn; });
}

// Saisie dans la liste : entiers seulement, plafonnés au reste, cartons recalculés avec logique H2 / H1
document.addEventListener('input', e => {
  const row = e.target.closest && e.target.closest('#ppList .pp-row'); if (!row) return;
  const check = row.querySelector('.pp-check');
  if (e.target.classList.contains('pp-qty')) {
    const inp = e.target, avail = +inp.dataset.avail, qpc = +inp.dataset.qpc || 1;
    const fullBox = row.dataset.box || 'H2';
    let d = digitsOnly(inp.value);
    if (d !== inp.value) { inp.value = d; flashError(inp); }
    if ((+d || 0) > avail) { inp.value = String(avail); flashError(inp); d = String(avail); }
    const smart = computeSmartCarton(+d || 0, qpc, fullBox);
    const c = row.querySelector('.pp-cartons');
    if (c.dataset.manual !== '1') c.value = smart.cartons;
    const det = row.querySelector('.pp-smart-detail');
    if (det) det.textContent = smart.detail;
    check.checked = true;
  } else if (e.target.classList.contains('pp-cartons')) {
    e.target.value = digitsOnly(e.target.value) || '1';
    e.target.dataset.manual = '1'; check.checked = true;
  }
});

function importFromProduction() {
  const dest = ($('#ppDest').value || '').trim().toUpperCase() || 'STOCK';
  const picked = [];
  $$('#ppList .pp-row').forEach(row => {
    if (!row.querySelector('.pp-check').checked) return;
    const lot = state.production.find(l => l.id === row.dataset.id); if (!lot) return;
    const qty = parseQty(row.querySelector('.pp-qty').value);
    const cInp = row.querySelector('.pp-cartons');
    if (qty < 1) return;
    const smart = computeSmartCarton(qty, lot.qte_par_carton, lot.type_carton || 'H2');
    picked.push({
      lot,
      qty,
      cartons: Math.max(1, parseInt(cInp.value) || smart.cartons),
      manual: cInp.dataset.manual === '1',
      boxLabel: smart.boxLabel
    });
  });
  if (!picked.length) return toast('Cochez au moins un lot avec une quantité.', 'warning');

  // on retire la ligne vide du départ
  $$('#itemsBody tr').forEach(tr => {
    const v = f => tr.querySelector(`[data-field="${f}"]`).value.trim();
    if (!v('reference') && !v('designation') && !parseQty(v('quantite')) && !tr.dataset.prod) tr.remove();
  });
  picked.forEach(p => addItemRow({
    reference: p.lot.reference, categorie: p.lot.categorie, designation: p.lot.designation,
    destinataire: dest, unite: p.lot.unite, quantite: String(p.qty), cartons: p.cartons, cartonsManual: p.manual,
    production_id: p.lot.id, base_carton: p.lot.type_carton || 'H2', type_carton: p.boxLabel, poids_carton: p.lot.poids_carton, of_numero: p.lot.of_numero,
    qpc: p.lot.qte_par_carton,
  }));
  updateModalTotals();
  closeModal('prodPickerModal');
  toast(`${picked.length} ligne(s) importée(s) depuis la production avec colisage calculé.`, 'success');
}
