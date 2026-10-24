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

let chartTransporter = null;
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
    confirmDialog('Se déconnecter ?').then(yes => { 
      if (yes) {
        if (onlineChannel) { state.supabase.removeChannel(onlineChannel); onlineChannel = null; }
        state.supabase.auth.signOut(); 
      }
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
        })),
      }));
      saveLocal(); setDbBadge('ok', `Connecté`); loaded = true;

      refMemory = {};
      const clients = new Set(['STOCK']);
      const carriers = new Set(['YAZID', 'YALIDINE', 'DJALAL', 'CLIENT', 'AUTRE']);
      const units = new Set(['UN', 'ID', 'BOBINE']);
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
}

// --- RECHERCHE DYNAMIQUE ---
function applyFilters() {
  const q = ($('#searchInput').value || '').toLowerCase().trim();
  const year = $('#filterYear').value;
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
            <button onclick="printExpedition('${esc(e.id)}')" class="btn-icon" title="Imprimer BL"><i class="fa-solid fa-print text-indigo-400"></i></button>
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
function updateCharts() {
  const isLight = document.documentElement.classList.contains('light');
  const textColor = isLight ? '#475569' : '#94a3b8';
  const gridColor = isLight ? '#e2e8f0' : '#334155';
  
  const colors = {
    indigo: 'rgba(99, 102, 241, 0.8)',
    cyan: 'rgba(6, 182, 212, 0.8)',
    amber: 'rgba(245, 158, 11, 0.8)',
  };

  const transporterData = {};
  const clientData = {};
  const productData = {};

  state.filtered.forEach(e => {
    const t = e.transporteur || 'AUTRE';
    transporterData[t] = (transporterData[t] || 0);
    
    (e.items || []).forEach(it => {
      const q = parseQty(it.quantite);
      const c = parseInt(it.cartons) || 1;
      const dest = it.destinataire || 'STOCK';
      const prodName = (it.reference ? it.reference + ' - ' : '') + (it.designation || 'SANS NOM');
      
      // 1. Transporteur : basé sur le nombre de cartons (demande utilisateur)
      transporterData[t] += c;
      
      // 2. Clients & Produits : basé sur la quantité réelle
      clientData[dest] = (clientData[dest] || 0) + q;
      productData[prodName] = (productData[prodName] || 0) + q;
    });
  });

  const sortedTransporter = Object.entries(transporterData).sort((a,b) => b[1]-a[1]);
  const sortedClients = Object.entries(clientData).sort((a,b) => b[1]-a[1]).slice(0, 5);
  const sortedProducts = Object.entries(productData).sort((a,b) => b[1]-a[1]).slice(0, 10);

  if (chartTransporter) chartTransporter.destroy();
  if (chartClients) chartClients.destroy();
  if (chartProducts) chartProducts.destroy();

  const ctxTransporter = document.getElementById('chartTransporter');
  if (ctxTransporter) {
    chartTransporter = new Chart(ctxTransporter, {
      type: 'bar',
      data: {
        labels: sortedTransporter.map(d => d[0]),
        datasets: [{ label: 'Cartons', data: sortedTransporter.map(d => d[1]), backgroundColor: colors.indigo, borderRadius: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor }, grid: { display: false } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } }
        }
      }
    });
  }

  const ctxClients = document.getElementById('chartClients');
  if (ctxClients) {
    chartClients = new Chart(ctxClients, {
      type: 'bar',
      data: {
        labels: sortedClients.map(d => d[0]),
        datasets: [{ label: 'Quantité', data: sortedClients.map(d => d[1]), backgroundColor: colors.cyan, borderRadius: 6 }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } }
        }
      }
    });
  }

  const ctxProducts = document.getElementById('chartProducts');
  if (ctxProducts) {
    chartProducts = new Chart(ctxProducts, {
      type: 'bar',
      data: {
        labels: sortedProducts.map(d => d[0]),
        datasets: [{ label: 'Quantité', data: sortedProducts.map(d => d[1]), backgroundColor: colors.amber, borderRadius: 6 }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, font: { size: 9 } }, grid: { display: false } }
        }
      }
    });
  }
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
    <td class="p-2"><input class="inp font-mono-code input-uppercase" data-field="reference" list="productsList" value="${esc(item.reference||'')}" placeholder="Réf"></td>
    <td class="p-2"><input class="inp input-uppercase" data-field="categorie" list="categoriesList" value="${esc(item.categorie||'')}" placeholder="Catégorie"></td> <!-- NOUVEAU -->
    <td class="p-2"><input class="inp input-uppercase" data-field="designation" value="${esc(item.designation||'')}" placeholder="Désignation"></td>
    <td class="p-2"><input class="inp input-uppercase" data-field="destinataire" list="clientsList" value="${esc(item.destinataire||'STOCK')}"></td>
    <td class="p-2"><input class="inp text-center input-uppercase" data-field="unite" list="unitsList" value="${esc(item.unite||'UN')}"></td>
    <td class="p-2"><input class="inp text-right font-mono-code" data-field="quantite" value="${esc(item.quantite||'0')}"></td>
    <td class="p-2"><input class="inp text-center font-bold text-amber-400" data-field="cartons" type="number" min="1" value="${esc(item.cartons||'1')}"></td>
    <td class="p-2 text-center"><button type="button" class="btn-icon" data-remove aria-label="Supprimer"><i class="fa-solid fa-xmark text-rose-400 text-xs"></i></button></td>`;
  $('#itemsBody').appendChild(tr);
  tr.querySelector('[data-field="cartons"]').addEventListener('input', updateModalTotals);
  tr.querySelector('[data-remove]').addEventListener('click', () => { tr.remove(); updateModalTotals(); });
  
  const refInput = tr.querySelector('[data-field="reference"]');
  const catInput = tr.querySelector('[data-field="categorie"]');
  const desInput = tr.querySelector('[data-field="designation"]');
  const unitInput = tr.querySelector('[data-field="unite"]');
  
  // Auto-complétion étendue à la catégorie
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
function updateModalTotals() {
  const rows = $$('#itemsBody tr'); let total = 0; rows.forEach(tr => total += parseInt(tr.querySelector('[data-field="cartons"]').value) || 1);
  $('#modalTotal').textContent = `Total : ${total} carton(s)`; $('#itemsCount').textContent = `${rows.length}`;
}
function collectItems() {
  return $$('#itemsBody tr').map(tr => {
    const get = f => tr.querySelector(`[data-field="${f}"]`).value.trim().toUpperCase();
    return { reference: get('reference'), categorie: get('categorie'), designation: get('designation'), destinataire: get('destinataire') || 'STOCK', unite: get('unite') || 'UN', quantite: get('quantite') || '0', cartons: parseInt(get('cartons')) || 1 };
  }).filter(it => it.reference || it.designation);
}
async function saveExpedition() {
  if (!requireOperator()) return;
  const dateVal = $('#formDate').value; if (!dateVal) return toast("Date d'expédition requise.", "error");
  const items = collectItems(); if (!items.length) return toast("Renseignez au moins un article.", "error");
  
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
  const username = $('#opUsername').value.trim().toLowerCase(), password = $('#opPassword').value, role = $('#opRole').value;
  if (password.length < 6) return toast("Le mot de passe doit faire 6 caractères minimum.", "error");
  const { error } = await state.supabase.rpc('create_operator', { p_username: username, p_password: password, p_role: role });
  if (error) return toast('Création impossible : ' + error.message, 'error');
  $('#opUsername').value = ''; $('#opPassword').value = ''; toast('Compte opérateur créé.', 'success'); await loadOperators();
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
});