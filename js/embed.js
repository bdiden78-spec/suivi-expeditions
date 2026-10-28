/* ==========================================================
   LogiTrak — Affichage d'un site externe à l'intérieur d'une page
   Utilisé par : pointage.html, gestion.html, webmail.html
   Chaque page contient simplement :
     <main id="embedRoot" data-url="https://..." data-name="Nom" data-icon="fa-..." data-c1="#..." data-c2="#..."></main>
   Pour ajouter un autre site : copier une de ces pages, changer les données,
   puis ajouter un onglet dans js/nav.js.
   ========================================================== */
(function () {
  'use strict';
  const root = document.getElementById('embedRoot');
  if (!root) return;
  const d = root.dataset;
  const url = d.url, name = d.name || 'Site', icon = d.icon || 'fa-link';
  document.documentElement.style.setProperty('--ec1', d.c1 || '#ec4899');
  document.documentElement.style.setProperty('--ec2', d.c2 || '#a855f7');

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ---------- Thème (bouton du haut) ---------- */
  const THEME_KEY = 'logitrak_theme';
  function syncThemeIcon() {
    const i = document.getElementById('themeIcon');
    if (i) i.className = 'fa-solid text-sm ' + (document.documentElement.classList.contains('light') ? 'fa-moon' : 'fa-sun');
  }
  window.toggleTheme = function () {
    const light = document.documentElement.classList.toggle('light');
    try { localStorage.setItem(THEME_KEY, light ? 'light' : 'dark'); } catch (e) {}
    syncThemeIcon();
  };
  syncThemeIcon();

  /* ---------- Styles ---------- */
  const st = document.createElement('style');
  st.textContent = `
    .frame-wrap{position:relative;flex:1;min-height:72vh;border-radius:20px;overflow:hidden;background:#fff;
      border:1px solid var(--border-strong);box-shadow:0 24px 50px -24px rgba(0,0,0,.55);
      animation:frameOpen .6s cubic-bezier(.22,.8,.3,1) both}
    @keyframes frameOpen{from{opacity:0;transform:scale(.97) translateY(16px)}to{opacity:1;transform:none}}
    .frame-wrap iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}
    .frame-load{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
      background:var(--bg-card);color:var(--text-muted);font-size:13px;font-weight:600;transition:opacity .4s;z-index:2}
    .frame-load.done{opacity:0;pointer-events:none}
    .spin{width:42px;height:42px;border-radius:50%;border:4px solid var(--border-strong);border-top-color:var(--ec1);animation:embedSpin .9s linear infinite}
    @keyframes embedSpin{to{transform:rotate(360deg)}}
    @media (prefers-reduced-motion:reduce){.frame-wrap{animation:none}}
  `;
  document.head.appendChild(st);

  /* ---------- Contenu de la page ---------- */
  root.className = 'relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex-1 w-full flex flex-col gap-3 no-print';
  root.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs" style="color:var(--text-muted)"><i class="fa-solid ${esc(icon)} mr-1" style="color:var(--ec1)"></i>« ${esc(name)} » s'affiche ici, dans LogiTrak. Les onglets restent à votre disposition.</p>
      <div class="flex items-center gap-2">
        <button id="embReload" class="btn btn-secondary" title="Recharger"><i class="fa-solid fa-rotate-right text-xs"></i><span class="hidden sm:inline">Recharger</span></button>
        <button id="embFull" class="btn btn-secondary" title="Plein écran"><i class="fa-solid fa-expand text-xs"></i><span class="hidden sm:inline">Plein écran</span></button>
        <a href="${esc(url)}" target="_blank" rel="noopener" class="btn btn-primary"><i class="fa-solid fa-arrow-up-right-from-square"></i><span class="hidden sm:inline">Ouvrir dans un nouvel onglet</span></a>
      </div>
    </div>

    <div id="embHint" class="hidden px-4 py-3 rounded-xl text-xs" style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);color:#f59e0b">
      <i class="fa-solid fa-triangle-exclamation mr-1"></i>Si la zone reste vide ou affiche un message de refus, ce site n'autorise pas l'affichage à l'intérieur d'une autre page (protection prévue par le site lui-même). Utilisez alors le bouton <b>Ouvrir dans un nouvel onglet</b>.
    </div>

    <div class="frame-wrap">
      <div id="embLoad" class="frame-load"><div class="spin"></div><span>Ouverture de « ${esc(name)} »…</span></div>
      <iframe id="embFrame" src="${esc(url)}" title="${esc(name)}"
        allow="camera; microphone; geolocation; fullscreen; clipboard-read; clipboard-write"
        referrerpolicy="no-referrer-when-downgrade"></iframe>
    </div>

    <button id="embHelp" class="self-start text-[11px] font-bold underline" style="color:var(--text-dim)">Ça ne s'affiche pas ?</button>
  `;

  const frame = document.getElementById('embFrame'), load = document.getElementById('embLoad'), hint = document.getElementById('embHint');
  let timer;
  const armHint = () => { clearTimeout(timer); timer = setTimeout(() => hint.classList.remove('hidden'), 9000); };
  frame.addEventListener('load', () => { load.classList.add('done'); clearTimeout(timer); });
  document.getElementById('embReload').addEventListener('click', () => { load.classList.remove('done'); frame.src = frame.src; armHint(); });
  document.getElementById('embFull').addEventListener('click', () => { if (frame.requestFullscreen) frame.requestFullscreen().catch(() => {}); });
  document.getElementById('embHelp').addEventListener('click', () => hint.classList.toggle('hidden'));
  armHint();
})();
