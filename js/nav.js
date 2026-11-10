/* ==========================================================
   LogiTrak — Barre d'onglets et contrôles d'administration
   ========================================================== */
(function () {
  'use strict';

  const APP_VERSION = 'v3.5';          // affichée à côté de la signature (changer ici à chaque nouvelle version)

  const TABS = [
    { id: 'index',        href: 'index.html',        icon: 'fa-house',           label: 'Accueil',      c1: '#6366f1', c2: '#3b82f6' },
    { id: 'production',   href: 'production.html',   icon: 'fa-industry',        label: 'Production',   c1: '#10b981', c2: '#34d399' },
    { id: 'colisage',     href: 'colisage.html',     icon: 'fa-boxes-packing',   label: 'Colisage',     c1: '#f59e0b', c2: '#fbbf24' },
    { id: 'envois',       href: 'envois.html',       icon: 'fa-truck-ramp-box',  label: 'Envois',       c1: '#06b6d4', c2: '#6366f1' },
    { id: 'algerie-poste', href: 'algerie-poste.html', icon: 'fa-envelope-open-text', label: 'Algérie Poste', c1: '#f59e0b', c2: '#f472b6', opOnly: true },
    { id: 'statistiques', href: 'statistiques.html', icon: 'fa-chart-pie',      label: 'Statistiques', c1: '#8b5cf6', c2: '#ec4899' },
    { id: 'new', action: true, icon: 'fa-plus', label: 'Nouvel envoi', c1: '#10b981', c2: '#06b6d4' },
    { id: 'pointage',     href: 'pointage.html',     icon: 'fa-fingerprint',     label: 'Pointage',     c1: '#ec4899', c2: '#a855f7' },
    { id: 'gestion',      href: 'https://www.gestion.eurequat-algerie.com/', external: true, icon: 'fa-briefcase', label: 'Gestion', c1: '#0ea5e9', c2: '#38bdf8' },
    { id: 'webmail',      href: 'https://srv29.novihost.net:2096/',        external: true, icon: 'fa-envelope',  label: 'Webmail', c1: '#ef4444', c2: '#f97316' },
  ];

  const file = (location.pathname.split('/').pop() || 'index').replace(/\.html$/i, '') || 'index';
  const current = TABS.some(t => t.id === file) ? file : 'index';

  /* ---------- Styles ---------- */
  const css = `
    body.has-nav > header{position:relative !important;z-index:45 !important}
    .nav-bar{position:sticky;top:0;z-index:40;background:var(--bg-card);border-bottom:1px solid var(--border);box-shadow:var(--shadow-card)}
    .nav-inner{max-width:80rem;margin:auto;padding:8px clamp(12px,2.5vw,32px);display:flex;align-items:center;justify-content:space-between;gap:10px}
    .nav-tabs{display:flex;align-items:center;gap:4px;flex-wrap:wrap;flex:1;min-width:0;padding:1px 4px}
    .nav-tab{position:relative;display:inline-flex;align-items:center;gap:6px;isolation:isolate;flex-shrink:0;
      min-height:35px;padding:6px clamp(8px,.8vw,13px);border-radius:6px;border:1px solid transparent;
      font-size:12px;font-weight:650;color:var(--text-muted);text-decoration:none;white-space:nowrap}
    .nav-tab::before{content:"";position:absolute;inset:0 2px;z-index:-1;transform:skewX(-10deg);border-radius:6px;border:1px solid transparent}
    .nav-tab i{font-size:12px}
    .nav-tab:hover{color:var(--text)}
    .nav-tab:hover::before{background:var(--bg-hover)}
    .nav-tab.active,.nav-tab.nav-action{color:var(--module,var(--accent))}
    .nav-tab.active::before{background:var(--module-bg,var(--accent-wash));border-color:color-mix(in srgb,var(--module,var(--accent)) 38%,var(--border))}
    .nav-tab.active::after{content:"";position:absolute;bottom:3px;left:12px;right:12px;height:2px;background:var(--module,var(--accent));border-radius:2px}
    .nav-tab.nav-action{appearance:none;background:transparent;cursor:pointer;font-family:inherit}
    .nav-btn{display:inline-flex;align-items:center;gap:7px;min-height:35px;padding:6px 10px;border-radius:7px;
      font-size:12px;font-weight:650;cursor:pointer;background:var(--bg-soft);border:1px solid var(--border);color:var(--text)}
    .nav-btn:hover{background:var(--bg-hover);border-color:var(--border-strong)}
    .nav-btn i{color:var(--accent)}
    .nav-right{flex-shrink:0}
    .header-admin-btns{display:inline-flex;align-items:center;gap:6px}
    @media(max-width:970px){.nav-inner{align-items:flex-start}.nav-tab{font-size:11.5px}}
    @media(max-width:600px){.nav-bar{position:relative}.nav-inner{flex-wrap:wrap}.nav-tabs{order:2;flex-basis:100%}.nav-right{margin-left:auto}}
    #appFooter{position:relative;z-index:10;text-align:center;padding:22px 16px 26px;margin-top:8px;border-top:1px solid var(--border);font-size:11px;color:var(--text-dim)}
    #appFooter p + p{margin-top:3px;font-weight:700;color:var(--text-muted)}
    .dz-dots{display:inline-flex;gap:4px;vertical-align:middle;margin:0 .4em}.dz-dots i{width:7px;height:7px;border-radius:50%;background:var(--dot);box-shadow:0 0 0 1px var(--border-strong, #888)}
    @media print{.nav-bar,#appFooter{display:none !important}}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const nav = document.createElement('nav');
  nav.className = 'nav-bar no-print';
  nav.id = 'appNav';
  nav.setAttribute('aria-label', 'Navigation principale');
  nav.innerHTML = `
    <div class="nav-inner">
      <div class="nav-tabs">
        ${TABS.filter(t => !['pointage', 'gestion', 'webmail'].includes(t.id)).map((t, i) => t.action ? `
          <button type="button" class="nav-tab nav-action" data-module="new" id="navNewExpedition" style="--tc1:${t.c1};--tc2:${t.c2};--i:${i}" title="Créer un nouvel envoi"><i class="fa-solid ${t.icon}"></i><span>${t.label}</span></button>` : `
          <a href="${t.href}" id="navTab_${t.id}" data-module="${t.id}" class="nav-tab${t.id === current ? ' active' : ''}${t.opOnly ? ' op-only' : ''}" style="--tc1:${t.c1};--tc2:${t.c2};--i:${i}"${t.id === current ? ' aria-current="page"' : ''}${t.external ? ' target="_blank" rel="noopener noreferrer" title="S\'ouvre dans un nouvel onglet"' : ''}>
            <i class="fa-solid ${t.icon}"></i><span>${t.label}</span>${t.external ? '<i class="fa-solid fa-arrow-up-right-from-square" style="font-size:9px;opacity:.6;margin-left:-2px"></i>' : ''}
          </a>`).join('')}
      </div>
      <div class="nav-right">
        <button type="button" class="nav-btn" id="navUser" title="Espace opérateur">
          <i class="fa-solid fa-user-lock"></i><span id="navUserText">Connexion</span>
        </button>
      </div>
    </div>`;

  const header = document.querySelector('body > header');
  if (header) header.after(nav); else document.body.prepend(nav);
  document.body.classList.add('has-nav');

  const headerActions = document.getElementById('headerActions');
  if (headerActions) {
    const tools = document.createElement('div');
    tools.className = 'header-tools';
    tools.setAttribute('aria-label', 'Raccourcis et compte utilisateur');
    tools.innerHTML = TABS.filter(t => ['pointage', 'gestion', 'webmail'].includes(t.id)).map(t =>
      '<a class="nav-btn header-shortcut' + (t.id === current ? ' active' : '') + '" data-module="' + t.id +
      '" href="' + t.href + '"' + (t.external ? ' target="_blank" rel="noopener noreferrer"' : '') +
      ' title="' + t.label + (t.external ? ' · Nouvel onglet' : '') + '"' + (t.id === current ? ' aria-current="page"' : '') +
      '><i class="fa-solid ' + t.icon + '" aria-hidden="true"></i><span>' + t.label + '</span></a>').join('');
    tools.appendChild(nav.querySelector('#navUser'));
    headerActions.insertBefore(tools, headerActions.querySelector('[onclick="toggleTheme()"]'));
    nav.querySelector('.nav-right').remove();
  }


  function injectHeaderAdminBtns() {
    const headerRight = document.getElementById('headerActions');
    if (!headerRight) return;
    
    if (document.body.classList.contains('is-admin') && !document.getElementById('headerAdminGroup')) {
      const group = document.createElement('div');
      group.id = 'headerAdminGroup';
      group.className = 'header-admin-btns adm-only';
      group.innerHTML = `
        <button type="button" class="nav-btn" id="headOpsBtn" title="Gérer les opérateurs"><i class="fa-solid fa-users-gear text-indigo-400"></i><span class="hidden sm:inline">Opérateurs</span></button>
      `;
      headerRight.insertBefore(group, headerRight.firstChild);

      group.querySelector('#headOpsBtn').addEventListener('click', () => {
        if (typeof window.openOperators === 'function') window.openOperators();
        else location.href = 'envois.html?admin=ops';
      });
    }

    const logo = document.getElementById('appBrandLogo');
    if (logo && !logo.dataset.cfgBound) {
      logo.dataset.cfgBound = '1';
      logo.style.cursor = 'default';
      logo.addEventListener('dblclick', () => {
        if (!document.body.classList.contains('is-admin')) {
          if (typeof window.toast === 'function') window.toast('Accès refusé : réservé à l’administrateur.', 'error');
          else alert('Accès refusé : réservé à l’administrateur.');
          return;
        }
        if (typeof window.openAdmin === 'function') window.openAdmin();
        else location.href = 'envois.html?admin=config';
      });
    }
  }

  const newExpBtn = nav.querySelector('#navNewExpedition');
  newExpBtn.addEventListener('click', () => {
    if (file === 'envois' && typeof window.openExpeditionModal === 'function') window.openExpeditionModal();
    else location.href = 'envois.html?new=1';
  });

  if (!document.getElementById('appFooter')) {
    const ft = document.createElement('footer');
    ft.id = 'appFooter'; ft.className = 'no-print';
    ft.innerHTML = '<p>LogiTrak • Eurequat Algérie • Usine Tlemcen</p><p>Designed by Boumediene © 2026 • ' + APP_VERSION + '<span class="dz-dots" aria-hidden="true"><i style="--dot:#fff"></i><i style="--dot:#d21034"></i><i style="--dot:#006233"></i></span>• Tous droits réservés.</p>';
    document.body.appendChild(ft);
  }

  // Badge rouge : nombre d'envois à valider (visible seulement par les inscrits)
  const pendingCss = document.createElement('style');
  pendingCss.textContent = '.nav-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;margin-left:4px;border-radius:99px;background:#ef4444;color:#fff;font-size:10px;font-weight:800;line-height:1;box-shadow:0 0 0 2px var(--bg);animation:navPulse 1.8s ease-in-out infinite}@keyframes navPulse{50%{transform:scale(1.15)}}@media (prefers-reduced-motion:reduce){.nav-badge{animation:none}}';
  document.head.appendChild(pendingCss);
  let pendingClient = null;
  async function refreshPending() {
    const tab = document.getElementById('navTab_envois'); if (!tab) return;
    let n = (typeof window.LT_PENDING === 'number') ? window.LT_PENDING : null;     // la page Envois / l'accueil connaissent déjà le chiffre
    if (n === null && readUser() && window.supabase && typeof SUPABASE_URL !== 'undefined') {
      try {
        pendingClient = pendingClient || window.supabase.createClient(localStorage.getItem('supabase_url') || SUPABASE_URL, localStorage.getItem('supabase_key') || SUPABASE_ANON, { auth: { autoRefreshToken: false } });
        const r = await pendingClient.from('expeditions').select('id', { count: 'exact', head: true }).eq('validation', 'A_VALIDER');
        n = r.error ? 0 : (r.count || 0);
      } catch (e) { n = 0; }
    }
    const old = tab.querySelector('.nav-badge'); if (old) old.remove();
    if (n > 0 && readUser()) {
      const b = document.createElement('span'); b.className = 'nav-badge'; b.textContent = n > 99 ? '99+' : String(n);
      b.title = n + ' envoi(s) à valider'; tab.appendChild(b);
    }
  }
  window.LTNavRefreshPending = n => { window.LT_PENDING = n; refreshPending(); };

  function readUser() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) {
          const v = JSON.parse(localStorage.getItem(k));
          const email = (v && v.user && v.user.email) || (v && v.currentSession && v.currentSession.user && v.currentSession.user.email);
          if (email) return email.split('@')[0];
        }
      }
    } catch (e) {}
    return '';
  }
  const userBtn = document.getElementById('navUser'), userText = document.getElementById('navUserText');
  function refreshUser() {
    const u = readUser();
    userText.textContent = u || 'Connexion';
    userBtn.title = u ? 'Connecté : ' + u : 'Espace opérateur';
    injectHeaderAdminBtns();
  }
  function clearTokens() {
    try { Object.keys(localStorage).filter(k => /^sb-.*-auth-token/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  }
  async function logout() {
    const yes = typeof window.confirmDialog === 'function' ? await window.confirmDialog('Se déconnecter ?') : window.confirm('Se déconnecter ?');
    if (!yes) return;
    try {
      if (window.supabase && typeof SUPABASE_URL !== 'undefined') {
        const url = localStorage.getItem('supabase_url') || SUPABASE_URL, key = localStorage.getItem('supabase_key') || SUPABASE_ANON;
        await window.supabase.createClient(url, key).auth.signOut({ scope: 'local' });
      }
    } catch (e) {}
    clearTokens();
    location.reload();
  }
  userBtn.addEventListener('click', () => {
    if (typeof window.authAction === 'function') return window.authAction();
    if (readUser()) return logout();
    go('envois.html?login=1');
  });
  refreshUser();
  setTimeout(refreshPending, 900);
  window.addEventListener('storage', refreshUser);
  new MutationObserver(refreshUser).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  setTimeout(refreshUser, 1500);

  function go(url) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { location.href = url; return; }
    document.body.classList.add('nav-leaving');
    setTimeout(() => { location.href = url; }, 190);
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    const href = a.getAttribute('href') || '';
    if (!/^[\w\-./]+\.html(\?[\w\-=&%.]*)?$/i.test(href)) return;
    if (a.classList.contains('active')) { e.preventDefault(); return; }
    e.preventDefault(); go(href);
  });
  window.addEventListener('pageshow', () => document.body.classList.remove('nav-leaving'));
})();