/* Gestion des cartons physiques encore disponibles dans le stock. */
let stockCartons = [];
let editingStockCarton = null;

function stockReserved(lotId) {
  return stockCartons.reduce((sum, box) => sum + (Number(box.contenu[lotId]) || 0), 0);
}

function stockAvailable(lot) {
  if (!lot.colisage_valide) return 0;
  const n = state.shippedN[lot.id] || 0;
  const m = state.shippedM[lot.id] || 0;
  const partial = LTColis.partialAvailable(lot, n, m);
  return Math.max(0, partial - stockReserved(lot.id) + (Number(editingStockCarton?.contenu[lot.id]) || 0));
}

async function loadStockCartons() {
  const { data, error } = await state.sb.from('cartons_stock').select('*').is('expedition_id', null).order('created_at');
  stockCartons = data || [];
  $('#stockNew').disabled = !!error;
  if (error) {
    $('#stockList').textContent = 'Stock indisponible. Vérifiez la migration v2.3 et la connexion à Supabase.';
    return;
  }
  $('#stockList').innerHTML = stockCartons.map(box => {
    const content = Object.entries(box.contenu).map(([id, qty]) => {
      const lot = state.lots.find(l => l.id === id);
      return esc((lot?.reference || lot?.of_numero || id) + ' × ' + fmtNum(qty));
    }).join(' · ');
    return '<div class="panel-soft p-3 flex flex-wrap items-center gap-2">' +
      '<div class="flex-1"><div class="text-sm font-extrabold">Carton ' + esc(box.type_carton) +
      ' · ' + esc(box.id.slice(0, 8).toUpperCase()) + '</div><div class="text-xs">' + content + '</div></div>' +
      '<button type="button" class="btn btn-secondary" data-stock-edit="' + esc(box.id) + '">Modifier</button>' +
      '<button type="button" class="btn btn-secondary" data-stock-remove="' + esc(box.id) + '">Défaire</button>' +
      '<a class="btn btn-primary" href="envois.html?new=1&amp;carton=' + encodeURIComponent(box.id) + '">Expédier</a></div>';
  }).join('') || '<p class="text-xs" style="color:var(--text-muted)">Aucun carton composé en stock.</p>';
}

function closeStockEditor() {
  editingStockCarton = null;
  $('#stockEditor').classList.add('hidden');
}

function editStockCarton(id) {
  editingStockCarton = stockCartons.find(b => b.id === id) || null;
  $('#stockType').value = editingStockCarton?.type_carton || '';
  let count = 0;
  $('#stockChoices').innerHTML = state.lots.map(lot => {
    const available = stockAvailable(lot);
    if (!available) return '';
    count++;
    const qty = editingStockCarton?.contenu[lot.id] || '';
    const pack = lot.reliquat_mode === 'CARTON' ? lot.reliquat_carton || lot.type_carton : 'en vrac';
    return '<label class="panel-soft flex flex-wrap items-center gap-2 p-2">' +
      '<span class="flex-1 text-xs"><b>' + esc(lot.reference || lot.designation || lot.of_numero) + '</b> · ' +
      esc(lot.of_numero) + ' · ' + fmtNum(available) + ' ' + esc(lot.unite) + ' disponible(s) · ' + esc(pack) + '</span>' +
      '<input class="inp w-24" type="number" min="0" max="' + available + '" step="1" data-stock-lot="' +
      esc(lot.id) + '" value="' + esc(qty) + '" aria-label="Quantité du lot ' + esc(lot.of_numero) + '"></label>';
  }).join('') || '<p class="text-xs">Aucun reliquat disponible.</p>';
  $('#stockSave').disabled = count === 0;
  updateStockWeight();
  $('#stockEditor').classList.remove('hidden');
  $('#stockType').focus();
}

function stockContents() {
  return Object.fromEntries($$('#stockChoices [data-stock-lot]').filter(input => Number(input.value) > 0)
    .map(input => [input.dataset.stockLot, Number(input.value)]));
}

function selectedStockType(contents) {
  if ($('#stockType').value) return $('#stockType').value;
  const packed = state.lots.find(l => contents[l.id] && l.reliquat_mode === 'CARTON' &&
    ['H1', 'H2'].includes(l.reliquat_carton || l.type_carton));
  return packed ? packed.reliquat_carton || packed.type_carton : 'H2';
}

function updateStockWeight() {
  const contents = stockContents();
  const type = selectedStockType(contents);
  const weight = LTColis.mixedWeight(state.lots.filter(lot => contents[lot.id]).map(lot => ({
    qte: contents[lot.id], poids_bobine: LTColis.unitWeight(lot)
  })), type);
  $('#stockWeight').textContent = type + ' · ≈ ' + fmtKg(weight) + ' kg' + (weight > LTColis.MAX_CARTON_KG ? ' · dépasse 15 kg' : '');
}

async function saveStockCarton(event) {
  event.preventDefault();
  const contents = stockContents();
  if (!Object.keys(contents).length) return toast('Indiquez au moins une quantité.', 'warning');
  await writeStockCarton(editingStockCarton, selectedStockType(contents), contents, $('#stockSave'));
}

async function writeStockCarton(box, type, contents, button) {
  button.disabled = true;
  try {
    const { error } = await state.sb.rpc('save_carton_stock', {
      p_id: box?.id || null, p_type: type, p_contenu: contents, p_revision: box?.revision || null
    });
    if (error) throw error;
    closeStockEditor();
    if (await loadData()) render();
    toast(contents ? 'Carton enregistré.' : 'Carton défait : les quantités sont à nouveau disponibles.', 'success');
  } catch (error) {
    toast(error.message || 'Stock indisponible.', 'error');
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('click', async event => {
  const editButton = event.target.closest('[data-stock-edit]');
  if (editButton) return editStockCarton(editButton.dataset.stockEdit);
  const removeButton = event.target.closest('[data-stock-remove]');
  if (!removeButton) return;
  const box = stockCartons.find(b => b.id === removeButton.dataset.stockRemove);
  if (box && await confirmDialog('Défaire ce carton et libérer ses quantités ?')) {
    await writeStockCarton(box, null, null, removeButton);
  }
});
