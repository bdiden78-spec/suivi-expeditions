/* ==========================================================
   LogiTrak v21 — Décision du reliquat (utilisée par Production et Colisage)

   Quand une quantité ne remplit pas un nombre entier de cartons, il reste
   des bobines (le « reliquat »). C'est l'OPÉRATEUR qui décide :
     - CARTON : les mettre dans un carton (H1 ou H2 au choix) ;
     - STOCK  : les laisser en stock, ils partiront plus tard dans un carton mixte.

   Utilisation : LTReliquat.ask(lot, { sb, toast, reload }) -> Promise<boolean>
   ========================================================== */
(function (root) {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtNum = n => Number(n || 0).toLocaleString('fr-FR');
  const fmtKg = n => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 3 });

  function ensureModal() {
    if (document.getElementById('reliqModal')) return;
    const d = document.createElement('div');
    d.id = 'reliqModal'; d.className = 'modal-backdrop'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = `
      <div class="modal-content w-full max-w-md p-6 space-y-4">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-boxes-stacked"></i></div>
          <div><h3 class="text-base font-extrabold">Reliquat à placer</h3><p id="rqText" class="text-xs mt-1" style="color:var(--text-muted)"></p></div>
        </div>
        <label class="flex items-start gap-3 p-3 rounded-xl cursor-pointer" style="border:1px solid var(--border-strong)">
          <input type="radio" name="rqMode" value="CARTON" class="mt-1 accent-amber-500" checked>
          <span class="flex-1 text-xs"><b>Les mettre dans un carton</b><br><span style="color:var(--text-muted)">Un carton partiel est ajouté au colisage.</span>
            <span class="flex items-center gap-2 mt-2"><span class="font-bold">Carton :</span><select id="rqCarton" class="inp font-bold" style="max-width:140px"></select></span></span>
        </label>
        <label class="flex items-start gap-3 p-3 rounded-xl cursor-pointer" style="border:1px solid var(--border-strong)">
          <input type="radio" name="rqMode" value="STOCK" class="mt-1 accent-amber-500">
          <span class="flex-1 text-xs"><b>Les laisser en stock</b><br><span style="color:var(--text-muted)">Ils partiront plus tard dans un <b>carton mixte</b>, avec d'autres références.</span></span>
        </label>
        <p id="rqWarn" class="text-[11px] text-amber-500 hidden"></p>
        <div class="flex justify-end gap-2"><button type="button" id="rqLater" class="btn btn-secondary">Plus tard</button><button type="button" id="rqSave" class="btn btn-primary">Enregistrer la décision</button></div>
      </div>`;
    document.body.appendChild(d);
  }

  function ask(lot, ctx) {
    ensureModal();
    const L = root.LTColis, toast = (ctx && ctx.toast) || (() => {});
    return new Promise(resolve => {
      const R = L.remainderOf(lot), qpc = lot.qte_par_carton;
      const m = document.getElementById('reliqModal');
      const q = id => m.querySelector(id);
      q('#rqText').innerHTML = `Lot <b>${esc(lot.of_numero)}</b> — ${esc(lot.reference || lot.designation)} : <b>${fmtNum(lot.quantite_produite)} ${esc(lot.unite)}</b> remplissent ${Math.floor(lot.quantite_produite / qpc)} carton(s) de ${qpc}. Il reste <b class="text-amber-500">${R} ${esc(lot.unite)}</b> qui ne remplissent pas un carton.`;
      const types = (root.Listes && root.Listes.get) ? root.Listes.get('types_carton') : ['H1', 'H2'];
      q('#rqCarton').innerHTML = types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
      const current = String(lot.reliquat_carton || '') || L.suggestCarton(R, qpc, lot.type_carton, types);
      q('#rqCarton').value = types.includes(current) ? current : types[0];
      const mode = String(lot.reliquat_mode || 'CARTON');
      m.querySelectorAll('input[name="rqMode"]').forEach(r => { r.checked = r.value === mode; });

      const warn = q('#rqWarn');
      const refresh = () => {
        const mod = m.querySelector('input[name="rqMode"]:checked').value, t = q('#rqCarton').value;
        const kg = L.boxWeight(t, R, lot);
        if (mod === 'CARTON' && kg > L.MAX_CARTON_KG) { warn.textContent = `Attention : ce carton pèserait ${fmtKg(kg)} kg (maximum ${L.MAX_CARTON_KG} kg).`; warn.classList.remove('hidden'); }
        else warn.classList.add('hidden');
      };
      m.querySelectorAll('input[name="rqMode"]').forEach(r => { r.onchange = refresh; });
      q('#rqCarton').onchange = refresh; refresh();

      const close = v => { q('#rqSave').onclick = null; q('#rqLater').onclick = null; m.classList.remove('open'); resolve(v); };
      q('#rqLater').onclick = () => { toast('Reliquat à décider : le lot ne pourra pas être expédié avant.', 'warning'); close(false); };
      q('#rqSave').onclick = async () => {
        const mod = m.querySelector('input[name="rqMode"]:checked').value;
        const upd = { reliquat_mode: mod, reliquat_carton: mod === 'CARTON' ? q('#rqCarton').value : '', qte_reliquat: R };
        const { error } = await ctx.sb.from('production').update(upd).eq('id', lot.id);
        if (error) { toast('Échec : ' + (error.message || error), 'error'); return; }
        toast(mod === 'STOCK' ? `${R} ${lot.unite} laissés en stock (carton mixte).` : `Reliquat de ${R} placé dans un carton ${upd.reliquat_carton}.`, 'success');
        close(true);
        if (ctx.reload) await ctx.reload();
      };
      m.classList.add('open');
    });
  }

  root.LTReliquat = { ask };
})(typeof window !== 'undefined' ? window : globalThis);
