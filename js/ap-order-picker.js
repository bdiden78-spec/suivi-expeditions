function isAPProductionCategory(value) {
  return String(value || '').normalize('NFD').toUpperCase().replace(/[^A-Z]/g, '').includes('ALGERIEPOSTE');
}
function pendingAPOrders(orders, runs) {
  const totals = new Map();
  for (const run of runs) totals.set(run.commande_id, (totals.get(run.commande_id) || 0) + Number(run.quantite_imprimee || 0));
  return orders.map(order => ({ ...order, printed: totals.get(order.id) || 0,
    remaining: Math.max(0, Number(order.quantite_demandee) - (totals.get(order.id) || 0)),
  })).filter(order => order.remaining > 0).sort((a,b) => a.date_commande.localeCompare(b.date_commande));
}
let apOrderPicker;
async function chooseAPProductionOrder() {
  if (!apOrderPicker) {
    apOrderPicker = document.createElement('dialog');
    apOrderPicker.id = 'apOrderPicker';
    apOrderPicker.className = 'panel p-5 space-y-4';
    apOrderPicker.setAttribute('aria-labelledby', 'apPickerTitle');
    apOrderPicker.innerHTML = '<div class="flex items-center justify-between gap-3"><h3 id="apPickerTitle" class="font-bold">Choisir une commande Algérie Poste à produire</h3>' +
      '<button type="button" class="btn-icon" aria-label="Fermer" data-close-picker><i class="fa-solid fa-xmark"></i></button></div>' +
      '<p class="text-sm" style="color:var(--text-muted)">Sélectionnez une commande UPW dont la quantité demandée n’a pas encore été entièrement imprimée. Vous pourrez saisir la quantité et les numéros de l’impression.</p>' +
      '<div id="apPickerOrders" class="space-y-2" aria-live="polite"></div>' +
      '<div class="flex flex-wrap justify-end gap-2"><button type="button" class="btn btn-secondary" data-close-picker>Annuler</button>' +
      '<a href="algerie-poste.html" class="btn btn-secondary">Gérer les commandes</a></div>';
    apOrderPicker.querySelectorAll('[data-close-picker]').forEach(button => button.addEventListener('click',()=>apOrderPicker.close()));
    document.body.appendChild(apOrderPicker);
  }
  if (apOrderPicker.open) return;
  const list = apOrderPicker.querySelector('#apPickerOrders');
  list.textContent = 'Chargement des commandes…';
  apOrderPicker.showModal();
  try {
    const [orders,runs] = await Promise.all([readLogiTrakRows(state.sb,'ap_commandes'),readLogiTrakRows(state.sb,'ap_productions')]);
    const available = pendingAPOrders(orders,runs);
    list.innerHTML = available.map(order => '<a class="panel-soft p-3 block" style="text-decoration:none" href="algerie-poste.html?commande=' +
      encodeURIComponent(order.id) + '&amp;production=1"><b>' + esc(order.client) + '</b><div class="text-xs">' +
      esc((order.categorie === 'NATIONAL' ? 'National' : 'International') + ' · ' + order.sous_categorie + ' · ' + order.date_commande) +
      '</div><div class="text-sm mt-1">Demandés ' + fmtNum(order.quantite_demandee) + ' · Imprimés ' + fmtNum(order.printed) +
      ' · <b>À produire ' + fmtNum(order.remaining) + ' ID</b></div></a>').join('') ||
      '<p class="panel-soft p-4 text-sm">Aucune commande en attente. Créez une commande Algérie Poste pour commencer.</p>';
  } catch(error) {
    console.warn(error);
    list.textContent = 'Commandes indisponibles. Vérifiez la connexion et l’installation du module Algérie Poste.';
  }
}
