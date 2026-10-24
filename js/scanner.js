/* ==========================================================
   LogiTrak — Scan de la RÉFÉRENCE avec l'appareil photo
   (code-barres, DataMatrix, QR)
   - Un clic sur une case « Référence » VIDE ouvre la caméra.
   - Le code lu remplit UNIQUEMENT la case Référence.
   - Les autres cases (désignation, catégorie…) restent à remplir
     par l'utilisateur.
   - La caméra n'est autorisée par le navigateur qu'en https
     (ou en local sur l'ordinateur).
   ========================================================== */
(function () {
  'use strict';

  const ZX_URLS = [
    'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js',
    'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js',
  ];
  const NATIVE_FORMATS = ['data_matrix', 'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8',
                          'upc_a', 'upc_e', 'itf', 'codabar', 'qr_code'];

  let overlay = null, video = null, canvas = null, ctx = null, statusEl = null;
  let stream = null, running = false, timer = null, target = null;
  let detector = null, zxReader = null, zxHints = null;

  /* ---------- Interface ---------- */
  function injectStyle() {
    if (document.getElementById('scanStyle')) return;
    const st = document.createElement('style');
    st.id = 'scanStyle';
    st.textContent = `
      #scanOverlay{position:fixed;inset:0;z-index:100;background:rgba(2,6,23,.94);display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;color:#fff}
      #scanOverlay .scan-box{position:relative;width:min(100%,520px)}
      #scanOverlay video{width:100%;max-height:62vh;border-radius:18px;object-fit:cover;background:#000;display:block}
      #scanOverlay .scan-frame{position:absolute;left:12%;right:12%;top:22%;bottom:22%;border:3px solid #fbbf24;border-radius:16px;box-shadow:0 0 0 9999px rgba(0,0,0,.35);pointer-events:none}
      #scanOverlay .scan-frame::after{content:"";position:absolute;left:6%;right:6%;height:2px;background:#fbbf24;box-shadow:0 0 10px #fbbf24;animation:scanLine 1.8s ease-in-out infinite}
      @keyframes scanLine{0%{top:8%}50%{top:90%}100%{top:8%}}
      #scanOverlay .scan-status{font-size:13px;font-weight:600;text-align:center;max-width:520px;min-height:20px}
      #scanOverlay .scan-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
    `;
    document.head.appendChild(st);
  }

  function buildOverlay() {
    if (overlay) return;
    injectStyle();
    overlay = document.createElement('div');
    overlay.id = 'scanOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Scanner la référence');
    overlay.innerHTML = `
      <div class="text-sm font-extrabold" style="font-size:15px;font-weight:800"><i class="fa-solid fa-barcode" style="margin-right:8px;color:#fbbf24"></i>Scanner la référence</div>
      <div class="scan-box">
        <video playsinline muted></video>
        <div class="scan-frame"></div>
      </div>
      <div class="scan-status"></div>
      <div class="scan-actions">
        <button type="button" class="btn btn-secondary" data-scan-manual><i class="fa-solid fa-keyboard"></i>Saisir au clavier</button>
        <button type="button" class="btn btn-secondary" data-scan-close><i class="fa-solid fa-xmark"></i>Fermer</button>
      </div>`;
    document.body.appendChild(overlay);
    video = overlay.querySelector('video');
    statusEl = overlay.querySelector('.scan-status');
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });

    overlay.querySelector('[data-scan-close]').addEventListener('click', closeScanner);
    overlay.querySelector('[data-scan-manual]').addEventListener('click', goManual);
  }

  const setStatus = t => { if (statusEl) statusEl.textContent = t; };

  /* ---------- Moteur de lecture ---------- */
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url; s.onload = resolve; s.onerror = () => reject(new Error('chargement impossible'));
      document.head.appendChild(s);
    });
  }
  async function loadZXing() {
    if (window.ZXing) return;
    for (const url of ZX_URLS) {
      try { await loadScript(url); if (window.ZXing) return; } catch (e) { /* on essaie l'adresse suivante */ }
    }
    throw new Error('lecteur indisponible');
  }
  async function pickEngine() {
    detector = null; zxReader = null;
    // 1) Lecteur intégré au navigateur (Chrome Android), s'il sait lire les DataMatrix
    if ('BarcodeDetector' in window) {
      try {
        const sup = await window.BarcodeDetector.getSupportedFormats();
        if (sup.includes('data_matrix')) {
          detector = new window.BarcodeDetector({ formats: NATIVE_FORMATS.filter(f => sup.includes(f)) });
          return;
        }
      } catch (e) { /* on passe au lecteur ZXing */ }
    }
    // 2) Sinon : bibliothèque ZXing (iPhone, autres navigateurs)
    await loadZXing();
    const Z = window.ZXing;
    zxHints = new Map();
    zxHints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
      Z.BarcodeFormat.DATA_MATRIX, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39,
      Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A,
      Z.BarcodeFormat.ITF, Z.BarcodeFormat.CODABAR, Z.BarcodeFormat.QR_CODE,
    ]);
    zxHints.set(Z.DecodeHintType.TRY_HARDER, true);
    zxReader = new Z.MultiFormatReader();
  }

  async function tick() {
    if (!running) return;
    try {
      if (video.readyState >= 2 && video.videoWidth) {
        let text = null;
        if (detector) {
          const found = await detector.detect(video);
          if (found.length) text = found[0].rawValue;
        } else if (zxReader) {
          const scale = Math.min(1, 1280 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            const Z = window.ZXing;
            const lum = new Z.HTMLCanvasElementLuminanceSource(canvas);
            const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(lum));
            text = zxReader.decode(bmp, zxHints).getText();
          } catch (e) { /* aucun code trouvé sur cette image */ }
        }
        if (text && String(text).trim()) { onCode(String(text).trim()); return; }
      }
    } catch (e) { /* on réessaie à la prochaine image */ }
    timer = setTimeout(tick, 120);
  }

  /* ---------- Ouverture / fermeture ---------- */
  function cameraError(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError')
      return "Accès à la caméra refusé. Autorise la caméra pour ce site dans le navigateur, ou saisis la référence au clavier.";
    if (n === 'NoMedia')
      return "Caméra indisponible : la page doit être ouverte en https (site publié). Saisis la référence au clavier.";
    if (n === 'NotFoundError' || n === 'OverconstrainedError')
      return "Aucune caméra trouvée sur cet appareil. Saisis la référence au clavier.";
    return "Impossible de démarrer le scan. Saisis la référence au clavier.";
  }

  async function openScanner(input) {
    if (running) return;
    target = input;
    buildOverlay();
    overlay.style.display = 'flex';
    setStatus('Démarrage de la caméra…');
    running = true;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw { name: 'NoMedia' };
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (!running) { stopStream(); return; }          // fermé pendant l'attente
      video.srcObject = stream;
      await video.play();
      setStatus('Préparation du lecteur…');
      await pickEngine();
      if (!running) return;
      setStatus('Placez le code-barres ou le DataMatrix dans le cadre.');
      tick();
    } catch (e) {
      if (!running) return;
      setStatus(cameraError(e));
      // la caméra ne marche pas : on laisse l'utilisateur saisir à la main
      if (target) target.dataset.manual = '1';
    }
  }

  function stopStream() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (video) video.srcObject = null;
  }
  function closeScanner() {
    running = false;
    clearTimeout(timer);
    stopStream();
    if (overlay) overlay.style.display = 'none';
  }
  function goManual() {
    const t = target;
    closeScanner();
    if (t) { t.dataset.manual = '1'; t.focus(); }
  }

  /* ---------- Résultat : on remplit SEULEMENT la référence ---------- */
  function onCode(text) {
    const t = target;
    closeScanner();
    if (!t) return;
    t.value = text.toUpperCase();
    // volontairement PAS d'évènement "change" : l'auto-remplissage des autres cases est évité
    t.dispatchEvent(new Event('input', { bubbles: true }));
    try { if (navigator.vibrate) navigator.vibrate(80); } catch (e) {}
    if (typeof window.toast === 'function') window.toast('Référence scannée : ' + t.value, 'success');
    // on passe à la case suivante (catégorie), à remplir par l'utilisateur
    const next = t.closest('tr') && t.closest('tr').querySelector('[data-field="categorie"]');
    if (next) next.focus();
  }

  /* ---------- Déclencheurs ---------- */
  // Un clic sur une case Référence vide ouvre le scan
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('input[data-field="reference"]');
    if (!el || running) return;
    if (el.value.trim() || el.dataset.manual === '1') return;
    el.blur();
    openScanner(el);
  });
  // Quand on quitte la case, le scan se réactive pour la prochaine fois
  document.addEventListener('focusout', e => {
    if (e.target && e.target.dataset && e.target.dataset.field === 'reference') delete e.target.dataset.manual;
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && running) closeScanner(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) closeScanner(); });
})();
