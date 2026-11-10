/* ==========================================================
   LogiTrak v18 — Listes fixes gérées par l'administrateur
   (catégories, unités de comptage, types de carton)
   - Valeurs par défaut intégrées ; l'admin peut en ajouter/retirer
   - Stockage : table Supabase "parametres" (+ copie locale de secours)
   ========================================================== */
(function () {
  const DEFAULTS = {
    categories:   ['RUBAN', 'ETIQUETTE', 'ETIQUETTE RFID', 'CARTE PVC', 'TAG', 'ALGERIE POSTE'],
    unites:       ['UN', 'PAQUET', 'ID'],
    types_carton: ['H1', 'H2'],
  };
  const LABELS = { categories: 'Catégories', unites: 'Unités de comptage', types_carton: 'Types de carton' };
  const LS_KEY = 'logitrak_listes_v18';
  let sb = null, isAdmin = false;
  let data = {};
  const bound = [];      // { el, key, kind, placeholder }
  const listeners = [];

  const norm = v => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = (arr, key) => {
    const out = [...new Set((Array.isArray(arr) ? arr : []).map(norm).filter(Boolean))];
    if (key === 'categories' && out.length && !out.some(value => value.normalize('NFD').replace(/[^A-Z]/g, '').includes('ALGERIEPOSTE'))) out.push('ALGERIE POSTE');
    return out.length ? out : DEFAULTS[key].slice();
  };

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
  }
  function writeLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {} }

  function reset(from) {
    data = {};
    Object.keys(DEFAULTS).forEach(k => { data[k] = clean(from && from[k], k); });
  }
  reset(readLocal());

  function get(key) { return (data[key] || DEFAULTS[key] || []).slice(); }

  /* ----- Remplissage des <select> et <datalist> liés ----- */
  function fillOne(b) {
    const el = b.el; if (!el) return;
    const list = get(b.key);
    if (b.kind === 'datalist') {
      el.innerHTML = list.map(v => `<option value="${esc(v)}">`).join('');
      return;
    }
    const cur = el.value, inList = list.includes(norm(cur));
    let html = b.placeholder ? `<option value="">${esc(b.placeholder)}</option>` : '';
    html += list.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if (cur && !inList) html += `<option value="${esc(cur)}">${esc(cur)} (hors liste)</option>`;
    el.innerHTML = html;
    el.value = !cur ? (b.placeholder ? '' : list[0]) : (inList ? norm(cur) : cur);
  }
  function refreshAll() { bound.forEach(fillOne); listeners.forEach(fn => { try { fn(); } catch {} }); }

  function bind(selOrEl, key, opts) {
    const el = typeof selOrEl === 'string' ? document.querySelector(selOrEl) : selOrEl;
    if (!el) return;
    const b = { el, key, kind: el.tagName === 'DATALIST' ? 'datalist' : 'select', placeholder: (opts && opts.placeholder) || '' };
    bound.push(b); fillOne(b);
  }
  // Affecte une valeur à un <select> lié (ajoute la valeur « hors liste » si besoin, ex. anciennes données)
  function setValue(selOrEl, v) {
    const el = typeof selOrEl === 'string' ? document.querySelector(selOrEl) : selOrEl;
    if (!el) return;
    v = String(v ?? '');
    if (v && ![...el.options].some(o => o.value === v)) {
      const o = document.createElement('option'); o.value = v; o.textContent = v + ' (hors liste)'; el.appendChild(o);
    }
    el.value = v;
  }

  /* ----- Chargement / enregistrement (Supabase) ----- */
  async function init(client, admin) {
    sb = client || sb;
    if (typeof admin === 'boolean') isAdmin = admin;
    if (!sb) { refreshAll(); return; }
    try {
      const { data: rows, error } = await sb.from('parametres').select('cle,valeurs');
      if (error) throw error;
      const fromDb = {};
      (rows || []).forEach(r => { if (DEFAULTS[r.cle]) fromDb[r.cle] = r.valeurs; });
      reset(fromDb); writeLocal();
    } catch (e) { /* table absente ou non connecté : on garde valeurs locales / par défaut */ }
    refreshAll();
  }
  function setAdmin(v) { isAdmin = !!v; }

  async function save(key, list) {
    list = clean(list, key);
    if (!sb) throw new Error('Base indisponible');
    const { error } = await sb.from('parametres').upsert({ cle: key, valeurs: list, updated_at: new Date().toISOString() });
    if (error) throw error;
    data[key] = list; writeLocal(); refreshAll();
  }

  /* ----- Fenêtre de gestion (administrateur) ----- */
  function ensureUI() {
    if (document.getElementById('listesModal')) return;
    const st = document.createElement('style');
    st.textContent = `.lst-btn{margin-left:6px;width:20px;height:20px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;cursor:pointer;border:1px solid var(--border-strong);background:var(--bg-input);color:var(--text-muted)}
    .lst-btn:hover{color:var(--text);background:var(--bg-hover)}
    .lst-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:99px;font-size:12px;font-weight:700;background:var(--bg-input);border:1px solid var(--border-strong)}
    .lst-chip button{color:#fb7185;font-size:11px;cursor:pointer;line-height:1}`;
    document.head.appendChild(st);
    const m = document.createElement('div');
    m.id = 'listesModal'; m.className = 'modal-backdrop'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = `<div class="modal-content w-full max-w-md p-6 space-y-4">
      <div class="flex items-center justify-between"><h3 id="lstTitle" class="text-base font-extrabold"></h3>
        <button type="button" class="btn-icon" id="lstClose" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button></div>
      <div id="lstChips" class="flex flex-wrap gap-2"></div>
      <form id="lstForm" class="flex gap-2"><input id="lstInput" class="inp input-uppercase flex-1" placeholder="Nouvelle valeur…" autocomplete="off" maxlength="40">
        <button type="submit" class="btn btn-primary">Ajouter</button></form>
      <p class="text-[11px]" style="color:var(--text-dim)">Réservé à l'administrateur. Retirer une valeur ne modifie pas les données déjà enregistrées.</p>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
    m.querySelector('#lstClose').addEventListener('click', () => m.classList.remove('open'));
  }
  let curKey = null;
  function drawChips() {
    const box = document.getElementById('lstChips');
    box.innerHTML = get(curKey).map(v => `<span class="lst-chip">${esc(v)}<button type="button" data-del="${esc(v)}" title="Retirer">✕</button></span>`).join('');
    box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      const v = b.dataset.del, list = get(curKey).filter(x => x !== v);
      if (!list.length) return toastMsg('Il faut garder au moins une valeur.', 'warning');
      try { await save(curKey, list); drawChips(); } catch (e) { toastMsg('Échec : ' + (e.message || e), 'error'); }
    }));
  }
  function toastMsg(msg, type) { if (typeof window.toast === 'function') window.toast(msg, type); else alert(msg); }

  function manage(key) {
    if (!isAdmin && !document.body.classList.contains('is-admin')) return toastMsg('Réservé à l’administrateur.', 'error');
    ensureUI(); curKey = key;
    const m = document.getElementById('listesModal');
    m.querySelector('#lstTitle').textContent = LABELS[key] || key;
    drawChips();
    const form = m.querySelector('#lstForm'), inp = m.querySelector('#lstInput');
    form.onsubmit = async e => {
      e.preventDefault();
      const v = norm(inp.value); if (!v) return;
      if (get(key).includes(v)) { toastMsg('Cette valeur existe déjà.', 'warning'); return; }
      try { await save(key, [...get(key), v]); inp.value = ''; drawChips(); toastMsg('Valeur ajoutée.', 'success'); }
      catch (err) { toastMsg('Échec : ' + (err.message || err) + ' — exécutez sql/v18-listes-et-verrous.sql dans Supabase.', 'error'); }
    };
    m.classList.add('open'); setTimeout(() => inp.focus(), 50);
  }

  window.Listes = { get, bind, setValue, init, setAdmin, manage, onChange: fn => listeners.push(fn), DEFAULTS };
})();
