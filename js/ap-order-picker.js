function isAPProductionCategory(value) {
  return String(value || '').normalize('NFD').toUpperCase().replace(/[^A-Z]/g, '').includes('ALGERIEPOSTE');
}
function pendingAPOrders(orders, runs) {
  const completed=new Map(),active=new Map();
  for(const run of runs) {
    const map=run.statut==='EN_COURS'?active:completed;
    const quantity=Number(run.statut==='EN_COURS'?run.quantite_prevue||0:run.quantite_imprimee||0);
    map.set(run.commande_id,(map.get(run.commande_id)||0)+quantity);
  }
  return orders.map(order=>({
    ...order,printed:completed.get(order.id)||0,running:active.get(order.id)||0,
    remaining:Math.max(0,Number(order.quantite_demandee)-(completed.get(order.id)||0)-(active.get(order.id)||0)),
  })).filter(order=>order.remaining>0).sort((a,b)=>a.date_commande.localeCompare(b.date_commande));
}
let apOrderPicker;
async function chooseAPProductionOrder() {
  if(apOrderPicker?.open) return;
  const dialog=document.createElement('dialog');
  apOrderPicker=dialog;
  dialog.id='apOrderPicker';
  dialog.className='panel p-5 space-y-4';
  dialog.setAttribute('aria-labelledby','apPickerTitle');
  dialog.innerHTML='<div class="flex justify-between items-center gap-3"><h3 id="apPickerTitle" class="font-bold">Production Algérie Poste</h3><button type="button" data-close class="btn btn-secondary">Fermer</button></div>'+
    '<p data-status role="status" class="text-sm">Chargement des commandes…</p>'+
    '<form hidden class="space-y-3"><label class="lbl">Commande en cours<select class="inp" name="order" required></select></label>'+
    '<button type="submit" class="btn btn-primary">Ouvrir les impressions de la commande</button></form>'+
    '<a href="algerie-poste.html" class="btn btn-secondary">Commandes et historique de fabrication</a>';
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.appendChild(dialog);
  dialog.showModal();
  const status=dialog.querySelector('[data-status]'),form=dialog.querySelector('form');
  const fields=form.elements,save=form.querySelector('[type="submit"]');
  try {
    const [orders,runs]=await Promise.all([readLogiTrakRows(state.sb,'ap_commandes'),readLogiTrakRows(state.sb,'ap_productions')]);
    if(!dialog.open) return;
    const active=pendingAPOrders(orders.filter(order=>apProductSpec(order.type_produit)),runs);
    if(!active.length) { status.textContent='Aucune commande en cours avec une quantité disponible.'; return; }
    fields.order.innerHTML='<option value="">Choisir une commande en cours</option>'+active.map(order=>
      '<option value="'+esc(order.id)+'">'+esc(order.client+' · '+order.sous_categorie+' · '+order.date_commande)+'</option>').join('');
    const selected=()=>active.find(order=>order.id===fields.order.value);
    function refresh() {
      const order=selected();
      save.disabled=!order;
      status.textContent=order?'Disponible pour cette commande · '+fmtNum(order.remaining)+' ID':'Choisissez une commande en cours.';
    }
    fields.order.addEventListener('change',refresh);
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const order=selected();
      if(order) location.href='algerie-poste.html?impression='+encodeURIComponent(order.id);
    });
    form.hidden=false;
    refresh();
  } catch(error) { status.textContent=error.message||'Commandes indisponibles.'; }
}


async function loadAPValidatedProduction() {
  const output=document.getElementById('apValidatedProduction');
  try {
    const [orders,runs]=await Promise.all([readLogiTrakRows(state.sb,'ap_commandes'),readLogiTrakRows(state.sb,'ap_productions')]);
    const byId=new Map(orders.map(order=>[order.id,order]));
    const rows=runs.filter(run=>run.statut==='TERMINE').sort((a,b)=>b.date_production.localeCompare(a.date_production)).map(run=>{
      const order=byId.get(run.commande_id);
      return '<tr><td class="p-3">'+esc(run.date_production)+'</td><td class="p-3">'+esc(order?.client||'')+
        '</td><td class="p-3">'+esc(run.imprimante||'Non renseignée')+'</td><td class="p-3">'+esc(run.numero_debut)+' → '+esc(run.numero_fin)+
        '</td><td class="p-3">'+fmtNum(run.quantite_imprimee)+'</td><td class="p-3"><a class="underline" href="colisage.html?commande-ap='+
        encodeURIComponent(run.commande_id)+'">Colisage</a></td></tr>';
    }).join('');
    output.innerHTML=rows?'<table class="w-full text-xs text-left"><thead><tr><th class="p-3">Date</th><th class="p-3">Client</th><th class="p-3">Imprimante</th>'+
      '<th class="p-3">Plage</th><th class="p-3">ID validés</th><th class="p-3">Colisage</th></tr></thead><tbody>'+rows+'</tbody></table>':'<p class="text-sm">Aucun tirage validé.</p>';
  } catch(error) { output.textContent='Production Algérie Poste indisponible.'; }
}
