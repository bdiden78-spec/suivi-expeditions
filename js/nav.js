/* ==========================================================
   LogiTrak — Barre d'onglets, identité visuelle et contrôles
   Palette officielle Eurequat Algérie (Bleu marine, Cyan & Orange vif)
   Version v5.2.1 — Thème Clair Dynamique & Personnalisation
   ========================================================== */
(function () {
  'use strict';

  const APP_VERSION = 'v5.2.1';

  /* ---------- Identité Visuelle Immuable Eurequat Algérie ---------- */
  const BRAND_LOGO = 'assets/logitrak-eurequat.jpg';
  const BRAND_SLOGAN = "Usine Tlemcen • Suivi d'expéditions";
  const BRAND_NAME = 'LogiTrak';

  // Purge de tout ancien branding personnalisé en cache local
  try { localStorage.removeItem('logitrak_branding'); } catch (e) {}

  function getBranding() {
    return {
      logo_url: BRAND_LOGO,
      slogan: BRAND_SLOGAN,
      app_name: BRAND_NAME
    };
  }

  function applyBranding() {
    const logos = document.querySelectorAll('#appBrandLogo, .app-brand img, .print-brand img');
    logos.forEach(img => {
      if (!img.src.endsWith(BRAND_LOGO) && img.src !== BRAND_LOGO) {
        img.src = BRAND_LOGO;
      }
    });

    const slogans = document.querySelectorAll('.site-label');
    slogans.forEach(el => {
      el.innerHTML = '<i class="fa-solid fa-location-dot text-sky-500 text-[10px] mr-1"></i>' + BRAND_SLOGAN;
    });

    document.querySelectorAll('.app-title-name').forEach(el => { el.textContent = BRAND_NAME; });
  }

  window.applyLogiTrakBranding = applyBranding;
  window.getLogiTrakBranding = getBranding;
  window.LOGITRAK_BRAND_DEFAULTS = getBranding();
  window.syncThemeIcon = function () {};
  window.toggleTheme = function () {};

  /* ---------- Contrôle d'Accès Strict & Gatekeeper Anti-Visionnage ---------- */
  const DEFAULT_SUPABASE_URL = "https://hswchbamojtmpystcuea.supabase.co";
  const DEFAULT_SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhzd2NoYmFtb2p0bXB5c3RjdWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MTc1MzIsImV4cCI6MjEwODE5MzUzMn0.6RUytS5zJEmlK9MBcJuHZ6G32RV63kShes2fNGf0_sU";

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
  window.readLogiTrakUser = readUser;
  window.isLogiTrakAuth = () => Boolean(readUser());

  function checkAuthAccess() {
    const user = readUser();
    if (!user) {
      const cur = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/i, '') + '.html';
      if (cur !== 'login.html') {
        const from = encodeURIComponent(cur + (location.search || ''));
        location.replace('login.html?from=' + from);
      }
      return false;
    }
    return true;
  }

  // Vérification immédiate du verrouillage d'accès
  checkAuthAccess();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAuthAccess);
  }

  // Appliquer immédiatement et au chargement
  applyBranding();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBranding);
  }

  /* ---------- Onglets & Navigation ---------- */
  const TABS = [
    { id: 'index',         href: 'index.html',         icon: 'fa-house',              label: 'Accueil',       c1: '#0284c7', c2: '#38bdf8' },
    { id: 'production',    href: 'production.html',    icon: 'fa-industry',           label: 'Production',    c1: '#0ea5e9', c2: '#22d3ee' },
    { id: 'stock',         href: 'production.html?tab=stock', icon: 'fa-warehouse',    label: 'Stock',   c1: '#00d2ff', c2: '#0284c7' },
    { id: 'receptions',    href: 'production.html?tab=recept', icon: 'fa-truck-ramp-box', label: 'Réceptions & Retours', c1: '#ff6b00', c2: '#f59e0b' },
    { id: 'colisage',      href: 'colisage.html',      icon: 'fa-boxes-packing',      label: 'Colisage',      c1: '#f97316', c2: '#fb923c' },
    { id: 'envois',        href: 'envois.html',        icon: 'fa-truck-fast',         label: 'Envois',        c1: '#0284c7', c2: '#06b6d4' },
    { id: 'algerie-poste', href: 'algerie-poste.html', icon: 'fa-envelope-open-text', label: 'Algérie Poste', c1: '#f97316', c2: '#fbbf24' },
    { id: 'statistiques',  href: 'statistiques.html',  icon: 'fa-chart-pie',          label: 'Statistiques',  c1: '#1d4ed8', c2: '#0ea5e9' },
    { id: 'pointage',      href: 'pointage.html',      icon: 'fa-fingerprint',        label: 'Pointage',      c1: '#0891b2', c2: '#38bdf8' },
    { id: 'gestion',       href: 'https://www.gestion.eurequat-algerie.com/', external: true, icon: 'fa-briefcase', label: 'Gestion', c1: '#0284c7', c2: '#38bdf8' },
    { id: 'webmail',       href: 'https://srv29.novihost.net:2096/',         external: true, icon: 'fa-envelope',  label: 'Webmail', c1: '#ea580c', c2: '#f97316' },
  ];

  const file = (location.pathname.split('/').pop() || 'index').replace(/\.html$/i, '') || 'index';
  const tabParam = new URLSearchParams(location.search).get('tab');
  let current = file;
  if (file === 'production') {
    if (tabParam === 'stock') current = 'stock';
    else if (tabParam === 'recept') current = 'receptions';
  }
  if (!TABS.some(t => t.id === current)) current = 'index';

  /* ---------- Styles Dynamiques de Navigation ---------- */
  const css = `
    body.has-nav > header{position:relative !important;z-index:45 !important}
    .nav-bar{position:sticky;top:0;z-index:40;background:rgba(255,255,255,0.94);backdrop-filter:blur(16px) saturate(180%);-webkit-backdrop-filter:blur(16px) saturate(180%);border-bottom:1px solid var(--border);box-shadow:0 4px 16px -2px rgba(15,23,42,0.06);transition:background-color .3s,border-color .3s}
    .nav-inner{max-width:85rem;margin:auto;padding:6px clamp(10px,2vw,24px);display:flex;align-items:center;justify-content:center;gap:8px}
    .nav-tabs{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;flex:1;min-width:0;padding:3px 2px}
    .nav-tabs::-webkit-scrollbar{display:none}
    .nav-tab{position:relative;display:inline-flex;align-items:center;gap:6px;isolation:isolate;flex-shrink:0;
      min-height:33px;padding:5px clamp(9px,0.9vw,13px);transform:skewX(-14deg);border-radius:6px;border:1px solid var(--border);
      font-size:11.5px;font-weight:700;color:var(--text-muted);text-decoration:none;white-space:nowrap;background:var(--bg-card);
      box-shadow:0 1px 2px rgba(15,23,42,0.04);transition:all .2s cubic-bezier(0.16,1,0.3,1)}
    .nav-tab > *{transform:skewX(14deg);display:inline-flex;align-items:center}
    .nav-tab i{font-size:12px;transition:transform .2s cubic-bezier(0.16,1,0.3,1)}
    .nav-tab:hover{color:var(--tc1,var(--accent));background:color-mix(in srgb,var(--tc1,var(--accent)) 8%,var(--bg-card));border-color:var(--tc1,var(--accent));transform:skewX(-14deg) translateY(-2px);box-shadow:0 4px 14px color-mix(in srgb,var(--tc1,var(--accent)) 25%,transparent)}
    .nav-tab:hover i{transform:scale(1.18);color:var(--tc1,var(--accent))}
    .nav-tab.active{color:#fff !important;background:linear-gradient(135deg,var(--tc1,#0284c7) 0%,var(--tc2,#38bdf8) 50%,var(--tc1,#0284c7) 100%) !important;background-size:220% 220% !important;animation:navGradShift 5s ease-in-out infinite !important;border-color:transparent !important;box-shadow:0 4px 16px color-mix(in srgb,var(--tc1,#0284c7) 50%,transparent) !important}
    .nav-tab.active i{color:#fff !important}
    .nav-tab.active::after{display:none}
    .nav-tab.nav-action{background:linear-gradient(135deg,rgba(234,88,12,0.14) 0%,rgba(2,132,199,0.14) 50%,rgba(234,88,12,0.14) 100%);background-size:200% 200%;animation:navGradShift 4s ease infinite;border:1px solid color-mix(in srgb,var(--primary) 40%,var(--border));color:var(--text);cursor:pointer;font-family:inherit}
    .nav-tab.nav-action:hover{background:linear-gradient(135deg,rgba(234,88,12,0.25),rgba(2,132,199,0.25));border-color:var(--primary);color:var(--primary);box-shadow:0 4px 16px rgba(234,88,12,0.3)}
    @keyframes navGradShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
    .nav-btn{display:inline-flex;align-items:center;gap:7px;min-height:33px;padding:5px 12px;transform:skewX(-14deg);border-radius:6px;
      font-size:11.5px;font-weight:700;cursor:pointer;background:var(--bg-card);border:1px solid var(--border-strong);color:var(--text);
      box-shadow:0 1px 2px rgba(15,23,42,0.04);transition:all .2s cubic-bezier(0.16,1,0.3,1)}
    .nav-btn > *{transform:skewX(14deg);display:inline-flex;align-items:center}
    .nav-btn:hover{background:var(--bg-hover);border-color:var(--accent);color:var(--accent);transform:skewX(-14deg) translateY(-2px);box-shadow:0 4px 14px color-mix(in srgb,var(--accent) 30%,transparent)}
    .nav-btn i{color:var(--accent);transition:transform .2s ease}
    .nav-btn:hover i{transform:scale(1.15)}
    .nav-right{flex-shrink:0}
    .header-admin-btns{display:inline-flex;align-items:center;gap:6px}
    @media(max-width:970px){.nav-tab{font-size:11px;padding:4px 8px}}
    @media(max-width:600px){.nav-inner{padding:6px 8px}}
    #appFooter{position:relative;z-index:10;text-align:center;padding:26px 16px 30px;margin-top:20px;border-top:1px solid var(--border);font-size:11.5px;color:var(--text-dim);background:var(--bg-soft)}
    #appFooter p + p{margin-top:6px;font-weight:750;color:var(--text)}
    .sig-badge{display:inline-flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px;color:var(--text-muted)}
    .sig-name,.sig-ver{font-weight:800;color:var(--accent)}
    .dz-dots{display:inline-flex;align-items:center;gap:5px;vertical-align:middle;margin:0 .5em}
    .dz-dots i{display:inline-block;width:15px;height:10px;transform:skewX(-14deg);border-radius:2.5px;background:var(--dot);box-shadow:0 0 0 1px var(--border-strong,#cbd5e1);transition:transform .25s cubic-bezier(0.16,1,0.3,1),box-shadow .25s cubic-bezier(0.16,1,0.3,1);animation:dzDotBreath 4s ease-in-out infinite}
    .dz-dots i:nth-child(1){background:#006233;box-shadow:0 0 6px rgba(0,98,51,0.4),0 0 0 1px rgba(0,98,51,0.5);animation-delay:0s}
    .dz-dots i:nth-child(2){background:#ffffff;box-shadow:0 0 6px rgba(15,23,42,0.15),0 0 0 1px #cbd5e1;animation-delay:.35s}
    .dz-dots i:nth-child(3){background:#d21034;box-shadow:0 0 6px rgba(210,16,52,0.4),0 0 0 1px rgba(210,16,52,0.5);animation-delay:.7s}
    @keyframes dzDotBreath{0%,100%{transform:skewX(-14deg) scale(1)}50%{transform:skewX(-14deg) scale(1.18) translateY(-1px);filter:brightness(1.15)}}
    .sig-badge:hover .dz-dots i{transform:skewX(-14deg) scale(1.22) translateY(-2px)}
    .sig-badge:hover .dz-dots i:nth-child(1){box-shadow:0 0 12px rgba(0,98,51,0.65),0 0 0 1px #006233}
    .sig-badge:hover .dz-dots i:nth-child(2){box-shadow:0 0 10px rgba(15,23,42,0.25),0 0 0 1px #94a3b8}
    .sig-badge:hover .dz-dots i:nth-child(3){box-shadow:0 0 12px rgba(210,16,52,0.65),0 0 0 1px #d21034}
    @media print{.nav-bar,#appFooter{display:none !important}}

    /* Dropdown Profil Opérateur */
    .user-menu-wrapper{position:relative;display:inline-block}
    .user-dropdown{position:absolute;top:calc(100% + 8px);right:0;width:240px;background:var(--bg-card);border:1px solid var(--border-strong);border-radius:14px;box-shadow:0 12px 30px -4px rgba(15,23,42,0.18),0 4px 12px -2px rgba(15,23,42,0.08);padding:6px;z-index:100;transform-origin:top right;animation:dropdownEnter .18s cubic-bezier(0.16,1,0.3,1);display:none}
    .user-dropdown.open{display:block}
    @keyframes dropdownEnter{from{opacity:0;transform:translateY(-8px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}
    .user-dropdown-header{padding:10px 12px;border-bottom:1px solid var(--border);margin-bottom:4px}
    .user-dropdown-name{font-weight:800;font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .user-dropdown-role{font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-top:2px}
    .user-dropdown-item{display:flex;align-items:center;gap:9px;width:100%;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:700;color:var(--text);background:transparent;border:0;cursor:pointer;text-align:left;transition:background-color .15s,color .15s;text-decoration:none}
    .user-dropdown-item:hover{background:var(--bg-hover);color:var(--accent)}
    .user-dropdown-item i{font-size:13px;width:16px;text-align:center}
    .user-dropdown-divider{height:1px;background:var(--border);margin:4px 0}
    body:not(.is-admin) #btnDropdownSettings { display: none !important; }
    .dz-dots { cursor: pointer; padding: 2px 4px; border-radius: 4px; transition: transform .2s, background-color .2s; }
    .dz-dots:hover { background: rgba(2, 132, 199, 0.12); }
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
          <a href="${t.href}" id="navTab_${t.id}" data-module="${t.id}" class="nav-tab${t.id === current ? ' active' : ''}" style="--tc1:${t.c1};--tc2:${t.c2};--i:${i}"${t.id === current ? ' aria-current="page"' : ''}${t.external ? ' target="_blank" rel="noopener noreferrer" title="S\'ouvre dans un nouvel onglet"' : ''}>
            <i class="fa-solid ${t.icon}"></i><span>${t.label}</span>${t.external ? '<i class="fa-solid fa-arrow-up-right-from-square" style="font-size:9px;opacity:.6;margin-left:-2px"></i>' : ''}
          </a>`).join('')}
      </div>
      <div class="nav-right">
        <div class="user-menu-wrapper" id="navUserWrapper">
          <button type="button" class="nav-btn" id="navUser" title="Espace opérateur">
            <i class="fa-solid fa-user-lock"></i><span id="navUserText">Connexion</span>
          </button>
          <div id="navUserDropdown" class="user-dropdown">
            <div class="user-dropdown-header">
              <div class="user-dropdown-name" id="dropdownUserName">Opérateur</div>
              <div class="user-dropdown-role" id="dropdownUserRole">Rôle : Opérateur</div>
            </div>
            <button type="button" id="btnDropdownChangePassword" class="user-dropdown-item">
              <i class="fa-solid fa-key text-amber-500"></i><span>Changer le mot de passe</span>
            </button>
            <a href="machines.html" id="btnDropdownSettings" class="user-dropdown-item hidden">
              <i class="fa-solid fa-gears text-emerald-500"></i><span>Paramètres &amp; Machines</span>
            </a>
            <div class="user-dropdown-divider"></div>
            <button type="button" id="btnDropdownLogout" class="user-dropdown-item text-rose-500">
              <i class="fa-solid fa-arrow-right-from-bracket"></i><span>Déconnexion</span>
            </button>
          </div>
        </div>
      </div>
    </div>`;

  const header = document.querySelector('body > header');
  if (header) header.after(nav); else document.body.prepend(nav);
  document.body.classList.add('has-nav');


  const layoutStyle=document.createElement('style');
  layoutStyle.textContent=`
    @media screen {
      body.has-nav{--lt-header-height:88px;--lt-sidebar-width:210px;padding-top:var(--lt-header-height);padding-left:var(--lt-sidebar-width)}
      body.has-nav>header{position:fixed!important;top:0;left:0;right:0;z-index:70}
      body.has-nav #appNav{position:fixed;top:var(--lt-header-height);bottom:0;left:0;width:var(--lt-sidebar-width);height:auto;overflow-y:auto;z-index:60;border-right:1px solid var(--border)}
      #appNav .nav-inner{display:block;padding:18px 16px;max-width:none}
      #appNav .nav-tabs{display:flex;flex-direction:column;align-items:stretch;gap:12px;overflow:visible;padding:4px 8px}
      #appNav .nav-tab{width:100%;min-height:42px;justify-content:flex-start;flex-shrink:0}
      body.has-nav>main{width:100%;min-width:0}
      body.has-nav #appFooter{margin-left:0}
      @media(max-width:760px){
        body.has-nav{--lt-sidebar-width:68px}
        #appNav .nav-inner{padding:14px 7px}
        #appNav .nav-tabs{padding:3px;gap:10px}
        #appNav .nav-tab{justify-content:center;padding:8px 4px}
        #appNav .nav-tab>span{display:none}
        #appNav .nav-tab i{margin:0}
        body.has-nav>header .site-label{display:none}
      }
    }
    @media print{body.has-nav{padding:0!important}}
  `;
  document.head.appendChild(layoutStyle);
  if(header){
    const updateHeaderHeight=()=>document.body.style.setProperty('--lt-header-height',Math.ceil(header.getBoundingClientRect().height)+'px');
    updateHeaderHeight();
    new ResizeObserver(updateHeaderHeight).observe(header);
  }
  nav.querySelectorAll('.nav-tab').forEach(link=>{
    if(!link.title) link.title=link.textContent.trim();
  });
  // Les actions liées à un lot conservent leur contexte de travail.
  document.querySelectorAll('main .page-heading a[href]').forEach(link=>{
    const target=new URL(link.href,location.href);
    if(target.origin!==location.origin||target.search||target.hash) return;
    if(TABS.some(tab=>tab.href&&new URL(tab.href,location.href).pathname===target.pathname)) link.remove();
  });

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
    tools.appendChild(nav.querySelector('#navUserWrapper') || nav.querySelector('#navUser'));

    // Retirer tout ancien bouton de thème s'il subsiste
    const themeBtn = headerActions.querySelector('[onclick*="toggleTheme"], #themeIcon');
    if (themeBtn) {
      const parentBtn = themeBtn.closest('button');
      if (parentBtn) parentBtn.remove();
    }
    headerActions.appendChild(tools);
    nav.querySelector('.nav-right')?.remove();
  }

  function injectHeaderAdminBtns() {
    // Identité visuelle officielle et logo verrouillés de manière permanente
  }

  const newExpBtn = nav.querySelector('#navNewExpedition');
  if (newExpBtn) {
    newExpBtn.addEventListener('click', () => {
      if (file === 'envois' && typeof window.openExpeditionModal === 'function') window.openExpeditionModal();
      else location.href = 'envois.html?new=1';
    });
  }

  if (!document.getElementById('appFooter')) {
    const ft = document.createElement('footer');
    ft.id = 'appFooter'; ft.className = 'no-print';
    ft.innerHTML = '<p style="font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--text-muted)">LogiTrak • Eurequat Algérie • Usine Tlemcen</p>' +
      '<p><span class="sig-badge"><span>Designed by</span> <span class="sig-name">Boumediene</span> <span>© 2026</span> <span class="sig-ver">' + APP_VERSION + '</span><span class="dz-dots" id="sigDzDots" role="button" tabindex="0" title="Cliquer pour afficher les coordonnées du propriétaire" aria-label="Informations propriétaire Boumediene"><i style="--dot:#006233"></i><i style="--dot:#fff"></i><i style="--dot:#d21034"></i></span><span>Tous droits réservés</span></span></p>';
    document.body.appendChild(ft);
  }

  /* Dialogue Coordonnées Propriétaire Application */
  function injectAuthorModal() {
    if (document.getElementById('authorContactModal')) return;
    const m = document.createElement('div');
    m.id = 'authorContactModal';
    m.className = 'modal-backdrop';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.65);backdrop-filter:blur(6px);z-index:99999;display:none;align-items:center;justify-content:center;padding:16px';
    m.innerHTML = `
      <div class="modal-content w-full max-w-sm p-6 text-center space-y-4 rounded-2xl border shadow-2xl" style="background:var(--bg-card);border:2px solid var(--border-strong)">
        <div class="w-13 h-13 w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-xl shadow-md" style="background:linear-gradient(135deg,rgba(2,132,199,0.15),rgba(234,88,12,0.15));color:#0284c7;border:1.5px solid rgba(2,132,199,0.3)">
          <img src="assets/favicon.ico" alt="LogiTrak" width="44" height="44" style="width:44px;height:44px;object-fit:contain">
        </div>
        <div class="space-y-2">
          <h3 class="text-base font-extrabold text-slate-900">LogiTrak <span class="text-sky-600">v5.2.1</span></h3>
          <div class="p-3.5 rounded-xl border space-y-2" style="background:var(--bg-soft);border-color:var(--border)">
            <p class="text-xs text-slate-700 font-bold">
              Contacter le propriétaire sur :
            </p>
            <a href="mailto:logitrakapp@gmail.com" class="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono font-extrabold text-sky-700 bg-white border border-sky-300 hover:border-sky-500 hover:bg-sky-50 transition shadow-sm">
              <i class="fa-solid fa-envelope text-sky-600"></i> logitrakapp@gmail.com
            </a>
          </div>
        </div>
        <div class="pt-1">
          <button type="button" class="btn btn-primary w-full justify-center text-xs font-bold" id="closeAuthorModalBtn">
            <i class="fa-solid fa-check mr-1.5"></i>Fermer
          </button>
        </div>
      </div>`;
    document.body.appendChild(m);
    const close = () => { m.style.display = 'none'; m.classList.remove('open'); };
    m.querySelector('#closeAuthorModalBtn')?.addEventListener('click', close);
    m.addEventListener('click', e => { if (e.target === m) close(); });
  }

  function openAuthorModal() {
    injectAuthorModal();
    const m = document.getElementById('authorContactModal');
    if (m) {
      m.style.display = 'flex';
      m.classList.add('open');
    }
  }

  document.addEventListener('click', e => {
    if (e.target.closest('.dz-dots, #sigDzDots')) {
      e.preventDefault();
      e.stopPropagation();
      openAuthorModal();
    }
  });

  // Badge rouge : nombre d'envois à valider (visible seulement par les inscrits)
  const pendingCss = document.createElement('style');
  pendingCss.textContent = '.nav-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;margin-left:4px;border-radius:9999px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:10px;font-weight:800;line-height:1;box-shadow:0 0 10px rgba(239,68,68,0.5),0 0 0 2px var(--bg-card);transform:skewX(14deg);animation:navPulse 2s cubic-bezier(0.16,1,0.3,1) infinite}@keyframes navPulse{0%,100%{transform:skewX(14deg) scale(1)}50%{transform:skewX(14deg) scale(1.18)}}@media (prefers-reduced-motion:reduce){.nav-badge{animation:none}}';
  document.head.appendChild(pendingCss);
  let pendingClient = null;
  async function refreshPending() {
    const tab = document.getElementById('navTab_envois'); if (!tab) return;
    let n = (typeof window.LT_PENDING === 'number') ? window.LT_PENDING : null;
    if (n === null && readUser() && window.supabase && typeof SUPABASE_URL !== 'undefined') {
      try {
        pendingClient = pendingClient || (typeof getLogiTrakClient === 'function' ? getLogiTrakClient() : window.supabase.createClient(localStorage.getItem('supabase_url') || SUPABASE_URL, localStorage.getItem('supabase_key') || SUPABASE_ANON));
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

  const userBtn = document.getElementById('navUser'), userText = document.getElementById('navUserText');
  const userDropdown = document.getElementById('navUserDropdown');
  const dropdownName = document.getElementById('dropdownUserName');
  const dropdownRole = document.getElementById('dropdownUserRole');
  const btnSettings = document.getElementById('btnDropdownSettings');
  const btnLogout = document.getElementById('btnDropdownLogout');
  const btnChangePass = document.getElementById('btnDropdownChangePassword');

  function injectPasswordModal() {
    if (document.getElementById('changePasswordModal')) return;
    const m = document.createElement('div');
    m.id = 'changePasswordModal';
    m.className = 'modal-backdrop';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);backdrop-filter:blur(6px);z-index:9999;display:none;align-items:center;justify-content:center;padding:16px';
    m.innerHTML = `
      <div class="modal-content w-full max-w-sm p-6 space-y-4 rounded-2xl border shadow-2xl" style="background:var(--bg-card);border-color:var(--border)">
        <div class="flex items-center justify-between pb-3 border-b" style="border-color:var(--border)">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center text-sm"><i class="fa-solid fa-key"></i></div>
            <h3 class="text-base font-extrabold" style="color:var(--text)">Changer mot de passe</h3>
          </div>
          <button type="button" id="closeChangePassBtn" class="btn-icon" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="changePasswordForm" class="space-y-3">
          <div>
            <label for="newPassInput" class="block text-xs font-bold mb-1" style="color:var(--text-muted)">Nouveau mot de passe (min 6 car.)</label>
            <input type="password" id="newPassInput" class="inp" minlength="6" required placeholder="••••••••" autocomplete="new-password">
          </div>
          <div>
            <label for="confirmPassInput" class="block text-xs font-bold mb-1" style="color:var(--text-muted)">Confirmer le mot de passe</label>
            <input type="password" id="confirmPassInput" class="inp" minlength="6" required placeholder="••••••••" autocomplete="new-password">
          </div>
          <p id="changePassMsg" class="text-xs text-rose-500 hidden"></p>
          <div class="flex items-center justify-end gap-2 pt-2">
            <button type="button" id="cancelChangePassBtn" class="btn btn-secondary text-xs">Annuler</button>
            <button type="submit" id="submitChangePassBtn" class="btn btn-primary font-bold text-xs"><i class="fa-solid fa-check mr-1.5"></i>Valider</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(m);

    const close = () => { m.style.display = 'none'; m.classList.remove('open'); };
    m.querySelector('#closeChangePassBtn')?.addEventListener('click', close);
    m.querySelector('#cancelChangePassBtn')?.addEventListener('click', close);
    m.addEventListener('click', e => { if (e.target === m) close(); });

    const form = m.querySelector('#changePasswordForm');
    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const p1 = m.querySelector('#newPassInput').value;
      const p2 = m.querySelector('#confirmPassInput').value;
      const msg = m.querySelector('#changePassMsg');
      const submitBtn = m.querySelector('#submitChangePassBtn');
      msg.classList.add('hidden');
      if (p1.length < 6) { msg.textContent = 'Le mot de passe doit faire au moins 6 caractères.'; msg.classList.remove('hidden'); return; }
      if (p1 !== p2) { msg.textContent = 'Les deux mots de passe ne correspondent pas.'; msg.classList.remove('hidden'); return; }

      if (submitBtn) submitBtn.disabled = true;
      try {
        if (!window.supabase || typeof SUPABASE_URL === 'undefined') throw new Error('Connexion base de données indisponible.');
        const url = localStorage.getItem('supabase_url') || SUPABASE_URL;
        const key = localStorage.getItem('supabase_key') || SUPABASE_ANON;
        const client = window.supabase.createClient(url, key);
        const { error } = await client.auth.updateUser({ password: p1 });
        if (error) throw error;
        if (typeof window.toast === 'function') window.toast('Mot de passe mis à jour avec succès.', 'success');
        else alert('Mot de passe mis à jour avec succès.');
        close();
        form.reset();
      } catch (err) {
        msg.textContent = err.message || 'Échec de la modification du mot de passe.';
        msg.classList.remove('hidden');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function openPasswordModal() {
    injectPasswordModal();
    const m = document.getElementById('changePasswordModal');
    if (m) {
      m.style.display = 'flex';
      m.classList.add('open');
      setTimeout(() => m.querySelector('#newPassInput')?.focus(), 50);
    }
  }

  function refreshUser() {
    checkAuthAccess();
    const u = readUser();
    if (userText) userText.textContent = u || 'Connexion';
    if (userBtn) userBtn.title = u ? 'Compte : ' + u + ' (Cliquer pour ouvrir le menu)' : 'Espace opérateur';
    if (dropdownName) dropdownName.textContent = u ? u.toUpperCase() : 'Non connecté';

    const isAdmin = document.body.classList.contains('is-admin');
    if (dropdownRole) {
      dropdownRole.textContent = isAdmin ? 'Rôle : Administrateur' : 'Rôle : Opérateur';
    }
    if (btnSettings) {
      btnSettings.classList.toggle('hidden', !isAdmin);
      btnSettings.style.display = isAdmin ? 'flex' : 'none';
    }
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
    location.replace('login.html');
  }

  if (userBtn) {
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const u = readUser();
      if (!u) {
        checkAuthAccess();
        return;
      }
      refreshUser();
      userDropdown?.classList.toggle('open');
    });
  }

  btnLogout?.addEventListener('click', () => {
    userDropdown?.classList.remove('open');
    logout();
  });

  btnChangePass?.addEventListener('click', () => {
    userDropdown?.classList.remove('open');
    openPasswordModal();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#navUserWrapper')) {
      userDropdown?.classList.remove('open');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') userDropdown?.classList.remove('open');
  });

  refreshUser();
  async function showSettingsForAdmin() {
    const u = readUser();
    if (!u) {
      document.body.classList.remove('is-admin');
      if (btnSettings) { btnSettings.classList.add('hidden'); btnSettings.style.display = 'none'; }
      return;
    }
    if (!window.supabase) return;
    try {
      const url = localStorage.getItem('supabase_url') || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : DEFAULT_SUPABASE_URL);
      const key = localStorage.getItem('supabase_key') || (typeof SUPABASE_ANON !== 'undefined' ? SUPABASE_ANON : DEFAULT_SUPABASE_ANON);
      const client = typeof getLogiTrakClient === 'function' ? getLogiTrakClient(url, key) : window.supabase.createClient(url, key);
      const { data, error } = await client.rpc('is_admin');
      if (!error && data === true) {
        document.body.classList.add('is-admin');
        if (btnSettings) { btnSettings.classList.remove('hidden'); btnSettings.style.display = 'flex'; }
        if (dropdownRole) dropdownRole.textContent = 'Rôle : Administrateur';
      } else {
        document.body.classList.remove('is-admin');
        if (btnSettings) { btnSettings.classList.add('hidden'); btnSettings.style.display = 'none'; }
        if (dropdownRole) dropdownRole.textContent = 'Rôle : Opérateur';
      }
    } catch(error) {
      console.warn(error);
      document.body.classList.remove('is-admin');
      if (btnSettings) { btnSettings.classList.add('hidden'); btnSettings.style.display = 'none'; }
    }
  }
  showSettingsForAdmin();
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
  /* Redressement automatique du texte des boutons inclinés à -14deg */
  function normalizeButtonTexts(root = document) {
    if (!root || !root.querySelectorAll) return;
    const targets = root.querySelectorAll('button:not(.btn-unstyled):not(.user-dropdown-item), .btn, .seg, .type-pill, #tabBtnList, #tabBtnNew, #viewBtnDate, #viewBtnTable');
    targets.forEach(btn => {
      btn.childNodes.forEach(node => {
        if (node.nodeType === 3 && node.textContent.trim()) {
          const span = document.createElement('span');
          span.textContent = node.textContent;
          node.replaceWith(span);
        }
      });
    });
  }

  normalizeButtonTexts();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => normalizeButtonTexts());
  }
  try {
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach(node => {
            if (node.nodeType === 1) normalizeButtonTexts(node);
          });
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (e) {}

  window.addEventListener('pageshow', () => document.body.classList.remove('nav-leaving'));
})();
(() => {
  function moveSubmenu() {
    const page=(location.pathname.split('/').pop()||'index.html').replace(/\.html$/,'');
    const selectors={
      production:'[id^="tabBtn_"]',
      'algerie-poste':'button[data-ap-tab]',
      colisage:'#tabRef,#tabLot,#tabExp'
    };
    if(!selectors[page]) return;
    const buttons=[...document.querySelectorAll(selectors[page])];
    const parent=document.getElementById('navTab_'+page);
    if(!parent||!buttons.length) return;
    const submenu=document.createElement('div');
    submenu.className='section-submenu';
    submenu.setAttribute('role','group');
    submenu.setAttribute('aria-label','Sous-menu '+parent.textContent.trim());
    parent.after(submenu);
    if(page==='production'){
      const update=tab=>{
        submenu.hidden=tab==='stock'||tab==='recept';
        submenu.style.display=submenu.hidden?'none':'';
        document.getElementById('navTab_production')?.classList.toggle('active',!submenu.hidden);
        document.getElementById('navTab_stock')?.classList.toggle('active',tab==='stock');
        document.getElementById('navTab_receptions')?.classList.toggle('active',tab==='recept');
      };
      update(new URLSearchParams(location.search).get('tab'));
      window.addEventListener('logitrak-production-tab',event=>update(event.detail));
    }
    const containers=new Set(buttons.map(button=>button.parentElement));
    buttons.forEach(button=>{
      button.classList.add('section-submenu-button');
      button.title=button.textContent.trim();
      submenu.append(button);
      if(button.id==='tabBtn_stock'||button.id==='tabBtn_recept'){button.hidden=true;button.style.display='none';}
    });
    containers.forEach(container=>{
      if(!container.children.length){
        const wrapper=container.parentElement;
        container.remove();
        if(wrapper?.tagName==='DIV'&&!wrapper.children.length) wrapper.remove();
      }
    });
  }
  const style=document.createElement('style');
  style.textContent=[
    '@media screen{',
    '#appNav .section-submenu{display:flex;flex-direction:column;gap:7px;margin:-4px 0 5px 12px;padding:6px 0 6px 9px;border-left:2px solid var(--border-strong)}',
    '#appNav .section-submenu-button{width:100%;height:auto;min-height:36px;white-space:normal;text-align:left;display:flex;align-items:center;justify-content:flex-start;gap:5px;padding:7px 9px;font-size:11px;line-height:1.35;transform:skewX(-8deg)}',
    '@media(max-width:760px){body.has-nav{--lt-sidebar-width:156px}#appNav .nav-tab>span{display:inline}#appNav .nav-tab{justify-content:flex-start;font-size:11px}#appNav .section-submenu{margin-left:5px;padding-left:6px}#appNav .section-submenu-button{font-size:10px;padding:6px}#appNav .section-submenu-button .badge{display:none}}',
    '}'
  ].join('');
  document.head.append(style);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',moveSubmenu);
  else moveSubmenu();
})();
(() => {
  const style = document.createElement('style');
  style.textContent = [
    '@media screen {',
    'body.has-nav>header>div:first-child{max-width:none!important;margin-left:0!important;margin-right:0!important;padding-left:32px!important;padding-right:24px!important}',
    'body.has-nav>header .app-brand{width:340px!important;height:108px!important;flex-shrink:0}',
    'body.has-nav>header .app-brand img{width:100%!important;height:100%!important;object-fit:contain}',
    '@media(max-width:760px){body.has-nav>header>div:first-child{padding-left:16px!important;padding-right:16px!important;flex-wrap:wrap}body.has-nav>header .app-brand{width:min(290px,calc(100vw - 32px))!important;height:92px!important}}',
    '}'
  ].join('');
  document.head.appendChild(style);
})();
(() => {
  const style = document.createElement('style');
  style.textContent = [
    '#appNav #badgeCartonsCount{display:inline-flex!important;align-items:center;justify-content:center;flex:0 0 auto;min-width:26px;height:26px;padding:0 7px;margin-left:auto;border-radius:50%!important;background:#f3efff!important;color:#6d28d9!important;font-size:11px;font-weight:800;font-style:normal;line-height:1}',
    'html:not(.light) #appNav #badgeCartonsCount{background:#f3efff!important;color:#6d28d9!important}'
  ].join('');
  document.head.appendChild(style);
})();
(() => {
  const style=document.createElement('style');
  style.textContent='.modal-backdrop{z-index:1000!important}';
  document.head.appendChild(style);
  function positionDialogs() {
    document.querySelectorAll('.modal-backdrop').forEach(dialog=>{
      if(dialog.parentElement!==document.body) document.body.appendChild(dialog);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',positionDialogs);
  else positionDialogs();
})();

(()=>{const add=()=>{const h=document.getElementById('headerActions');if(h&&!document.getElementById('operationsLink')){const a=document.createElement('a');a.id='operationsLink';a.href='operations.html';a.className='nav-btn';a.innerHTML='<i class="fa-solid fa-bell"></i><span>Suivi & alertes</span>';h.append(a);}};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add);else add();})();
(()=>{const src=new URL('pointrak-download.js?v=5.2.1-1',document.currentScript.src);const script=document.createElement('script');script.src=src.href;document.head.append(script);})();
