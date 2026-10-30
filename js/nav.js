/* ==========================================================
   LogiTrak — Barre d'onglets et contrôles d'administration
   ========================================================== */
(function () {
  'use strict';

  const TABS = [
    { id: 'index',        href: 'index.html',        icon: 'fa-house',           label: 'Accueil',      c1: '#6366f1', c2: '#3b82f6' },
    { id: 'production',   href: 'production.html',   icon: 'fa-industry',        label: 'Production',   c1: '#10b981', c2: '#34d399' },
    { id: 'colisage',     href: 'colisage.html',     icon: 'fa-boxes-packing',   label: 'Colisage',     c1: '#f59e0b', c2: '#fbbf24' },
    { id: 'envois',       href: 'envois.html',       icon: 'fa-truck-ramp-box',  label: 'Envois',       c1: '#06b6d4', c2: '#6366f1' },
    { id: 'pointage',     href: 'pointage.html',     icon: 'fa-fingerprint',     label: 'Pointage',     c1: '#ec4899', c2: '#a855f7' },
    { id: 'statistiques', href: 'statistiques.html', icon: 'fa-chart-pie',      label: 'Statistiques', c1: '#8b5cf6', c2: '#ec4899' },
    { id: 'gestion',      href: 'https://www.gestion.eurequat-algerie.com/', external: true, icon: 'fa-briefcase', label: 'Gestion', c1: '#0ea5e9', c2: '#38bdf8' },
    { id: 'webmail',      href: 'https://srv29.novihost.net:2096/',        external: true, icon: 'fa-envelope',  label: 'Webmail', c1: '#ef4444', c2: '#f97316' },
  ];

  const file = (location.pathname.split('/').pop() || 'index').replace(/\.html$/i, '') || 'index';
  const current = TABS.some(t => t.id === file) ? file : 'index';

  /* ---------- Styles ---------- */
  const css = `
    body.has-nav > header{position:relative !important;z-index:45 !important}
    .nav-bar{position:sticky;top:0;z-index:40;background:color-mix(in srgb, var(--bg) 86%, transparent);
      backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--border)}
    .nav-inner{max-width:80rem;margin:0 auto;padding:8px 16px 0;display:flex;align-items:flex-end;justify-content:space-between;gap:10px}
    @media(min-width:640px){.nav-inner{padding-left:24px;padding-right:24px}}
    @media(min-width:1024px){.nav-inner{padding-left:32px;padding-right:32px}}
    .nav-tabs{display:flex;align-items:flex-end;gap:4px;overflow-x:auto;scrollbar-width:none;flex:1;min-width:0;padding-top:6px}
    .nav-tabs::-webkit-scrollbar{display:none}
    .nav-tab{--tc1:#6366f1;--tc2:#3b82f6;position:relative;display:inline-flex;align-items:center;gap:8px;flex-shrink:0;
      padding:10px 16px 11px;margin-bottom:-1px;border-radius:14px 14px 0 0;border:1px solid transparent;border-bottom:0;
      font-size:13px;font-weight:700;color:var(--text-muted);text-decoration:none;white-space:nowrap;
      transition:color .2s,background .2s,transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .25s;
      animation:navTabIn .5s cubic-bezier(.22,.8,.3,1) both;animation-delay:calc(var(--i) * 70ms)}
    .nav-tab i{font-size:14px;transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
    .nav-tab::after{content:"";position:absolute;left:14px;right:14px;bottom:5px;height:2px;border-radius:2px;
      background:linear-gradient(90deg,var(--tc1),var(--tc2));transform:scaleX(0);transform-origin:left;transition:transform .3s ease}
    .nav-tab:hover{color:var(--text);background:var(--bg-hover);transform:translateY(-3px)}
    .nav-tab:hover i{transform:scale(1.25) rotate(-8deg);color:var(--tc1)}
    .nav-tab:hover::after{transform:scaleX(1)}
    .nav-tab.active{color:#fff;background:linear-gradient(135deg,var(--tc1),var(--tc2));
      box-shadow:0 -8px 22px -10px var(--tc1),inset 0 1px 0 rgba(255,255,255,.28);
      animation:navTabIn .5s cubic-bezier(.22,.8,.3,1) both,navTabOpen .6s cubic-bezier(.34,1.56,.64,1) .15s both}
    .nav-tab.active::after{display:none}
    .nav-tab.active:hover{transform:none}
    .nav-tab.active i{color:#fff}
    .nav-tab.nav-action{appearance:none;-webkit-appearance:none;background:transparent;cursor:pointer;font-family:inherit}
    .nav-tab.nav-action:focus-visible{outline:2px solid var(--tc1);outline-offset:3px}
    @keyframes navTabIn{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none}}
    @keyframes navTabOpen{0%{transform:scale(.88)}100%{transform:scale(1)}}

    .nav-right{display:flex;align-items:center;gap:8px;flex-shrink:0;padding-bottom:7px}
    .nav-btn{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;
      background:var(--bg-soft);border:1px solid var(--border);color:var(--text);transition:transform .2s,background .2s,border-color .2s}
    .nav-btn:hover{background:var(--bg-hover);border-color:var(--border-strong);transform:translateY(-1px)}
    .nav-btn i{color:#818cf8}

    .header-admin-btns{display:inline-flex;align-items:center;gap:6px}

    body.has-nav > main{animation:pageIn .5s cubic-bezier(.22,.8,.3,1) both}
    @keyframes pageIn{from{opacity:0;transform:translateY(14px) scale(.992)}to{opacity:1;transform:none}}
    body.nav-leaving > main{opacity:0;transform:translateY(8px) scale(.99);transition:opacity .18s ease,transform .18s ease}
    @media (prefers-reduced-motion:reduce){
      .nav-tab,.nav-tab.active,body.has-nav > main{animation:none !important}
      .nav-tab,body.nav-leaving > main{transition:none !important}
    }
    @media(max-width:900px){.nav-inner{align-items:center;flex-wrap:wrap}.nav-tabs{order:2;flex-basis:100%;padding-top:4px}.nav-right{order:1;margin-left:auto;padding-bottom:4px}}
    @media(max-width:520px){.nav-tab{padding:9px 12px 10px;font-size:12px}.nav-btn{padding:8px 10px;gap:6px}}
    #appFooter{position:relative;z-index:10;text-align:center;padding:22px 16px 26px;margin-top:8px;border-top:1px solid var(--border);font-size:11px;color:var(--text-dim)}
    #appFooter p + p{margin-top:3px;font-weight:700;color:var(--text-muted)}
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
        ${TABS.map((t, i) => `
          <a href="${t.href}" class="nav-tab${t.id === current ? ' active' : ''}" style="--tc1:${t.c1};--tc2:${t.c2};--i:${i}"${t.id === current ? ' aria-current="page"' : ''}${t.external ? ' target="_blank" rel="noopener noreferrer" title="S\'ouvre dans un nouvel onglet"' : ''}>
            <i class="fa-solid ${t.icon}"></i><span>${t.label}</span>${t.external ? '<i class="fa-solid fa-arrow-up-right-from-square" style="font-size:9px;opacity:.6;margin-left:-2px"></i>' : ''}
          </a>`).join('')}
        <button type="button" class="nav-tab nav-action" id="navNewExpedition" style="--tc1:#10b981;--tc2:#06b6d4;--i:${TABS.length}" title="Créer un nouvel envoi"><i class="fa-solid fa-plus"></i><span>Nouvel envoi</span></button>
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

  function injectHeaderAdminBtns() {
    const headerRight = document.querySelector('header .flex.items-center.gap-2');
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

    const logo = document.querySelector('header img');
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
    ft.innerHTML = '<p>LogiTrak • Eurequat Algérie • Usine Tlemcen</p><p>Designed by Boumediene © 2026</p>';
    document.body.appendChild(ft);
  }

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
  const userBtn = nav.querySelector('#navUser'), userText = nav.querySelector('#navUserText');
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