const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => Number(value || 0).toLocaleString('fr-FR');
const apState = { orders: [], runs: [], history: [], shipments: [], admin: false, orderEdit: null };
let sb;
function syncThemeIcon() {
  $('#themeIcon').className = 'fa-solid text-sm ' + (document.documentElement.classList.contains('light') ? 'fa-moon' : 'fa-sun');
}
function toggleTheme() {
  const light = document.documentElement.classList.toggle('light');
  try { localStorage.setItem('logitrak_theme', light ? 'light' : 'dark'); } catch {}
  syncThemeIcon();
}
function message(text, error = false) {
  $('#apMessage').textContent = text;
  $('#apMessage').classList.toggle('hidden', !text);
  $('#apMessage').style.color = error ? 'var(--danger)' : 'var(--text-muted)';
}
function canEdit(row) {
  return apState.admin || Date.now() - new Date(row.created_at).getTime() < 48 * 3600000;
}
function orderRuns(id) { return apState.runs.filter(row => row.commande_id === id); }
function printed(id) { return orderRuns(id).filter(run=>APtrace.completed(run)).reduce((sum,row)=>sum+row.quantite_imprimee,0); }
function runStateLabel(run) { return APtrace.completed(run) ? 'Terminé / validé' : 'En cours'; }
function runValidation(run) {
  if (!APtrace.completed(run)) return 'Validation en attente';
  return run.termine_at ? 'Validé le '+APtrace.timestamp(run.termine_at)+' par '+(run.termine_par || 'Non renseigné') : 'Historique : date de validation non renseignée';
}

function categoryLabel(value) { return value === 'NATIONAL' ? 'National' : 'International'; }
function resetOrder() {
  apState.orderEdit = null;
  $('#apOrderForm').reset();
  $('#apOrderDate').value = logitrakToday();
  $('#apOrderTitle').textContent = 'Nouvelle commande UPW';
  $('#apOrderCancel').classList.add('hidden');
  fillSubtypes();
}
function fillSubtypes(selected = '') {
  const category = $('#apCategory').value;
  $('#apSubtype').innerHTML = '<option value="">Choisir un produit</option>' + Object.entries(APproducts)
    .filter(([,product])=>product.category===category)
    .map(([code,product])=>'<option value="'+code+'">'+esc(product.label+' · '+product.copies+' exemplaires')+'</option>').join('');
  $('#apSubtype').value=selected;
}
async function loadAP() {
  const [orders, runs, history, shipments] = await Promise.all([
    readLogiTrakRows(sb, 'ap_commandes'), readLogiTrakRows(sb, 'ap_productions'), readLogiTrakRows(sb, 'ap_historique'), readLogiTrakRows(sb,'lignes_expedition','id,ap_production_id,quantite,expedition_id,expeditions(numero_bl,validation,date_envoi)'),
  ]);
  if (runs.some(run=>!run.statut)) throw new Error('Installez la migration sql/v38-flux-algerie-poste.sql.');
  apState.shipments=shipments.filter(line=>line.ap_production_id);
  apState.history = history.sort((a,b)=>b.horodatage.localeCompare(a.horodatage)||b.id.localeCompare(a.id));
  apState.orders = orders.sort((a,b) => b.date_commande.localeCompare(a.date_commande) || b.created_at.localeCompare(a.created_at));
  apState.runs = runs.sort((a,b) => a.date_production.localeCompare(b.date_production) || a.created_at.localeCompare(b.created_at));
  $('#apClients').innerHTML = [...new Set(orders.map(o => o.client))].sort().map(value => '<option value="' + esc(value) + '">').join('');
  const printers = [...new Set([...runs, ...history.flatMap(event=>[event.avant,event.apres].filter(Boolean))].map(run=>run.imprimante).filter(Boolean))].sort();
  const machine=$('#apTraceMachine').value;
  $('#apTraceMachine').innerHTML='<option value="">Toutes les imprimantes</option>'+printers.map(value=>'<option value="'+esc(value)+'">'+esc(value)+'</option>').join('');
  if(printers.includes(machine)) $('#apTraceMachine').value=machine;
  renderOrders(); renderTrace();
}
function renderOrders() {
  renderAPActive();
  $('#apCount').textContent=fmt(apState.orders.length);
  $('#apRequested').textContent=fmt(apState.orders.reduce((sum,order)=>sum+order.quantite_demandee,0));
  $('#apPrinted').textContent=fmt(apState.runs.filter(run=>APtrace.completed(run)).reduce((sum,run)=>sum+run.quantite_imprimee,0));
  $('#apRemaining').textContent=fmt(apState.orders.reduce((sum,order)=>sum+Math.max(0,order.quantite_demandee-printed(order.id)),0));
  const search=$('#apSearch').value.trim().toLowerCase(),filter=$('#apFilter').value;
  const expanded=new Set([...$('#apOrders').querySelectorAll('details[data-order][open]')].map(detail=>detail.dataset.order));
  $('#apOrders').innerHTML=apState.orders.filter(order=>(!filter||filter===order.categorie)&&
    (!search||[order.client,order.sous_categorie,order.date_commande].join(' ').toLowerCase().includes(search))
  ).map(order=>{
    const runs=orderRuns(order.id), spec=apProductSpec(order.type_produit), total=printed(order.id);
    const actors=new Set(), printers=new Set();
    const events=apState.history.filter(event=>event.commande_id===order.id);
    const snapshots=events.flatMap(event=>[event.avant,event.apres].filter(Boolean));
    for(const run of [...runs,...snapshots]){
      if(run.created_by) actors.add(run.created_by);
      if(run.termine_par) actors.add(run.termine_par);
      if(run.imprimante) printers.add(run.imprimante);
    }
    return '<details class="panel p-4" data-order="'+esc(order.id)+'"'+(expanded.has(order.id)?' open':'')+'>'+
      '<summary class="cursor-pointer"><b>'+esc(order.client)+'</b> · '+esc(spec?.label||order.sous_categorie)+' · '+esc(order.date_commande)+
      '<div class="text-sm mt-2">Commandés '+fmt(order.quantite_demandee)+' · Produits '+fmt(total)+' · Restants '+fmt(Math.max(0,order.quantite_demandee-total))+' ID</div></summary>'+
      '<div class="mt-4 space-y-3"><p class="text-sm">'+esc(spec?spec.colors+' · '+spec.reference+' · Gabarit '+spec.format:'Commande historique · type de produit à renseigner')+'</p>'+
      '<p class="text-sm">Opérateurs : '+esc([...actors].join(', ')||'Non renseignés')+'<br>Imprimantes : '+esc([...printers].join(', ')||'Non renseignées')+'</p>'+
      '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr><th class="p-3 text-left">Opérateur</th><th class="p-3 text-left">Plage inclusive</th><th class="p-3 text-left">ID imprimés</th><th class="p-3 text-left">Imprimante</th><th class="p-3 text-left">Date / état</th></tr></thead><tbody>'+
      (runs.map(run=>'<tr><td class="p-3">'+esc(run.created_by||'Non renseigné')+'</td><td class="p-3 font-mono-code">'+esc(run.numero_debut||'À compléter')+' → '+esc(run.numero_fin||'À compléter')+
      '</td><td class="p-3">'+(APtrace.completed(run)?fmt(run.quantite_imprimee):fmt(run.quantite_prevue)+' · À valider')+'</td><td class="p-3">'+esc(run.imprimante||'Non renseignée')+
      '</td><td class="p-3">'+esc(run.date_production)+'<br>'+esc(runValidation(run))+
      shipmentLink(run)+
      (canEdit(run)&&!apState.shipments.some(line=>line.ap_production_id===run.id)?'<br><button type="button" class="btn btn-secondary mt-2" data-ap-action="trace-run" data-id="'+esc(run.id)+'">'+
      (APtrace.completed(run)?'Modifier la traçabilité':'Compléter et valider')+'</button>':'')+'</td></tr>').join('')||'<tr><td colspan="5" class="p-3">Aucune production déclarée.</td></tr>')+
      '</tbody></table></div>'+
      (events.length?'<details class="panel-soft p-3"><summary class="cursor-pointer">Historique des tirages</summary><ul class="space-y-3 mt-3">'+events.map(event=>
        '<li><b>'+esc(event.action.replaceAll('_',' '))+'</b> · '+esc(APtrace.timestamp(event.horodatage))+' · '+esc(event.auteur||'Non renseigné')+
        (event.avant?'<div>Avant · '+traceSnapshot(event.avant)+'</div>':'')+(event.apres?'<div>Après · '+traceSnapshot(event.apres)+'</div>':'')+'</li>').join('')+'</ul></details>':'')+
      '<div class="flex flex-wrap gap-2"><a class="btn btn-secondary" href="colisage.html?commande-ap='+encodeURIComponent(order.id)+'">Voir le colisage</a>'+
      '<button type="button" class="btn btn-primary" data-ap-action="start-print" data-id="'+esc(order.id)+'">Démarrer une plage</button>'+
      '<button type="button" class="btn btn-secondary" data-ap-action="ship-order" data-id="'+esc(order.id)+'">Préparer un envoi</button>'+
      (canEdit(order)?'<button type="button" class="btn btn-secondary" data-ap-action="edit-order" data-id="'+esc(order.id)+'">Modifier la commande</button>'+
      '<button type="button" class="btn btn-secondary" data-ap-action="delete-order" data-id="'+esc(order.id)+'">Supprimer la commande</button>':'')+
      '</div></div></details>';
  }).join('')||'<p class="panel p-5 text-sm">Aucune commande à afficher.</p>';
}
function traceSnapshot(run) {
  if(!run) return 'Aucun';
  return esc(run.imprimante||'Machine non renseignée')+' · '+esc(runStateLabel(run))+' · '+fmt(APtrace.quantity(run))+' ID<br>'+
    '<span class="font-mono-code">'+esc(run.numero_debut||'—')+' → '+esc(run.numero_fin||'À compléter')+'</span><br>'+
    esc('Date de production : '+run.date_production)+'<br>'+esc(runValidation(run));
}
function renderTrace() {
  const filters={search:$('#apTraceSearch').value,identifier:$('#apTraceId').value,machine:$('#apTraceMachine').value,status:$('#apTraceState').value};
  const events=apState.history.filter(event=>APtrace.matches(event,filters));
  const labels={DEMARRAGE:'Démarrage',VALIDATION:'Validation',MODIFICATION:'Modification',REOUVERTURE:'Remis en cours',SUPPRESSION:'Suppression',REPRISE_HISTORIQUE:'Reprise de l’historique'};
  $('#apTraceCount').textContent=fmt(events.length)+' événement(s) · Dates et heures d’Algérie. La reprise de l’historique ne constitue pas une date de validation.';
  $('#apTraceRows').innerHTML=events.map(event=>{
    const snapshot=event.apres||event.avant;
    return '<tr><td class="p-3"><b>'+esc(labels[event.action]||event.action)+'</b><div>'+esc(APtrace.timestamp(event.horodatage))+'</div></td>'+
      '<td class="p-3">'+esc(event.commande.client||'Agence supprimée')+'<div>'+esc(event.commande.sous_categorie||'')+
      '</div><b title="'+esc(event.production_id)+'">'+esc(event.production_id.slice(0,8).toUpperCase())+'</b></td>'+
      '<td class="p-3">'+traceSnapshot(snapshot)+'</td><td class="p-3">'+esc(event.auteur||'Non renseigné')+
      '<div class="mt-1">'+esc(snapshot.created_by?'Saisi par '+snapshot.created_by:'')+'</div>'+
      '<div>'+esc(snapshot.termine_par?'Validé par '+snapshot.termine_par:'')+'</div></td>'+
      '<td class="p-3"><details><summary class="cursor-pointer">États enregistrés</summary>'+
      (event.avant?'<p class="mt-2"><b>Avant</b><br>'+traceSnapshot(event.avant)+'</p>':'')+
      (event.apres?'<p class="mt-2"><b>Après</b><br>'+traceSnapshot(event.apres)+'</p>':'')+'</details></td></tr>';
  }).join('')||'<tr><td colspan="5" class="p-4">Aucun événement correspondant.</td></tr>';
}
async function saveRecord(table, payload, previous) {
  let query = previous ? sb.from(table).update(payload).eq('id',previous.id).eq('revision',previous.revision) : sb.from(table).insert(payload);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('La fiche a changé ou son délai de modification est dépassé. Actualisez les données.');
  return data.id;
}
async function withButton(button, action) {
  button.disabled = true;
  try { await action(); }
  catch(error) { console.warn(error); message(error.message || 'Opération impossible.', true); }
  finally { button.disabled = false; }
}
async function saveOrder(event) {
  event.preventDefault();
  await withButton($('#apOrderSave'), async () => {
    const spec=apProductSpec($('#apSubtype').value);
    if(!spec) throw new Error('Choisissez un type de produit.');
    const payload = {
      client: $('#apClient').value.trim().toUpperCase(), categorie: $('#apCategory').value,
      type_produit: $('#apSubtype').value, sous_categorie: spec.label, quantite_demandee: Number($('#apQty').value),
      date_commande: $('#apOrderDate').value, observations: $('#apOrderNotes').value.trim(),
    };
    if (!payload.client || !payload.sous_categorie || !Number.isSafeInteger(payload.quantite_demandee) || payload.quantite_demandee < 1) throw new Error('Renseignez le client, la sous-catégorie et une quantité entière positive.');
    await saveRecord('ap_commandes',payload,apState.orderEdit);
    resetOrder(); await loadAP(); message('Commande enregistrée.');
  });
}
function editOrder(order) {
  if (!canEdit(order)) return message('Modification réservée à l’administrateur après 48 h.', true);
  apState.orderEdit=order;
  for(const [id,key] of Object.entries({apClient:'client',apCategory:'categorie',apQty:'quantite_demandee',apOrderDate:'date_commande',apOrderNotes:'observations'})) $('#'+id).value=order[key];
  fillSubtypes(order.type_produit||''); $('#apOrderTitle').textContent='Modifier la commande UPW'; $('#apOrderCancel').classList.remove('hidden'); $('#apClient').focus();
}
async function deleteOrder(order, button) {
  if (!canEdit(order)) return message('Suppression réservée à l’administrateur après 48 h.', true);
  const runs = orderRuns(order.id);
  if (runs.some(run => apState.shipments.some(line => line.ap_production_id === run.id))) {
    return message('Cette commande est liée à un envoi. Retirez ses tirages de l’envoi avant de la supprimer.', true);
  }
  const confirmation = runs.length ? 'Supprimer cette commande et ses tirages ? L’historique des impressions sera conservé.' : 'Supprimer cette commande ?';
  if (!window.confirm(confirmation)) return;
  await withButton(button, async () => {
    const {data,error}=await sb.from('ap_commandes').delete().eq('id',order.id).eq('revision',order.revision).select('id').maybeSingle();
    if(error) throw error;
    if(!data) throw new Error('La commande a changé ou le délai de suppression est dépassé. Actualisez les données.');
    if(apState.orderEdit?.id===order.id) resetOrder();
    await loadAP();
    message('Commande supprimée.');
  });
}
function openRunTrace(run) {
  if(!canEdit(run)) return;
  const quantity=APtrace.completed(run)?run.quantite_imprimee:run.quantite_prevue;
  const dialog=document.createElement('dialog');
  dialog.id='apOrderPicker';
  dialog.className='panel p-5 space-y-4';
  dialog.setAttribute('aria-labelledby','apTraceRunTitle');
  dialog.innerHTML='<h3 id="apTraceRunTitle" class="font-bold">Traçabilité du tirage</h3><p>'+fmt(quantity)+' ID · '+esc(run.date_production)+'</p>'+
    '<form class="space-y-3"><label class="lbl">Imprimante<input class="inp" name="printer" required maxlength="160"></label>'+
    '<label class="lbl">Premier numéro<input class="inp font-mono-code" name="first" required maxlength="80"></label>'+
    '<label class="lbl">Dernier numéro inclus<input class="inp font-mono-code" name="last" required maxlength="80"></label>'+
    '<label class="lbl">Observations<input class="inp" name="notes" maxlength="2000"></label>'+
    '<p data-status role="status" class="text-sm"></p><div class="flex flex-wrap gap-2">'+
    '<button type="submit" class="btn btn-primary">Enregistrer et valider</button>'+
    '<button type="button" data-close class="btn btn-secondary">Annuler</button></div></form>';
  const form=dialog.querySelector('form'),fields=form.elements,save=form.querySelector('[type="submit"]');
  const status=dialog.querySelector('[data-status]');
  fields.printer.value=run.imprimante||'';
  fields.first.value=run.numero_debut||'';
  fields.last.value=run.numero_fin||'';
  fields.notes.value=run.observations||'';
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const printer=fields.printer.value.trim(),first=fields.first.value.trim(),last=fields.last.value.trim();
    const error=APcalc.rangeError(first,last,quantity);
    if(error||!printer) { status.textContent=error||'Renseignez l’imprimante.'; return; }
    save.disabled=true;
    try {
      await saveRecord('ap_productions',{
        statut:'TERMINE',quantite_imprimee:quantity,imprimante:printer,
        numero_debut:first,numero_fin:last,observations:fields.notes.value.trim(),
      },run);
      dialog.close();
      await loadAP();
      message('Tirage validé.');
    } catch(error) {
      if(dialog.open) status.textContent=error.message;
      else message(error.message,true);
    } finally { save.disabled=false; }
  });
  document.body.appendChild(dialog);
  dialog.showModal();
}
function renderAPActive() {
  const picker=$('#apPrintOrder'), selected=picker.value;
  const printable=apState.orders.filter(order=>apProductSpec(order.type_produit)&&remainingForPrint(order)>0);
  picker.innerHTML='<option value="">Choisir une commande en cours</option>'+printable.map(order=>
    '<option value="'+esc(order.id)+'">'+esc(order.client+' · '+apProductSpec(order.type_produit).label+' · '+order.date_commande)+' · '+fmt(remainingForPrint(order))+' ID disponibles</option>'
  ).join('');
  if(printable.some(order=>order.id===selected)) picker.value=selected;
  $('#apPrintStart').disabled=!picker.value;
  const active=apState.runs.filter(run=>run.statut==='EN_COURS');
  $('#apActive').innerHTML=active.map(run=>{
    const order=apState.orders.find(row=>row.id===run.commande_id);
    return '<div class="panel-soft p-3 flex flex-wrap justify-between items-center gap-3"><div><b>'+esc(run.imprimante||'Imprimante à renseigner')+'</b> · '+
      esc(order?.client||'')+' · '+esc(run.created_by||'')+'<p class="text-xs">'+esc(run.numero_debut||'À compléter')+' → '+esc(run.numero_fin||'À compléter')+
      ' · '+fmt(run.quantite_prevue)+' ID</p></div>'+
      (canEdit(run)?'<button type="button" class="btn btn-primary" data-ap-action="validate-run" data-id="'+esc(run.id)+'">Valider la plage</button>':'')+'</div>';
  }).join('')||'<p class="text-sm">Aucune plage en cours.</p>';
}
async function validateAPPrint(run, button) {
  if(!canEdit(run)) return;
  if(!run.imprimante||APcalc.rangeError(run.numero_debut,run.numero_fin,run.quantite_prevue)) return openRunTrace(run);
  await withButton(button,async()=>{
    await saveRecord('ap_productions',{statut:'TERMINE',quantite_imprimee:run.quantite_prevue},run);
    await loadAP();
    message('Plage validée. L’imprimante est disponible.');
  });
}
function shipmentLink(run) {
  const lines=apState.shipments.filter(row=>row.ap_production_id===run.id);
  if(!lines.length) return '';
  const reserved=lines.reduce((sum,line)=>sum+Number(line.quantite),0);
  return lines.map(line=>{
    const expedition=line.expeditions;
    return '<br><a href="envois.html" class="underline">Envoi '+esc(expedition?.numero_bl||'')+
      ' · '+fmt(line.quantite)+' ID'+(expedition?.validation==='VALIDE'?' · validé':' · à valider')+'</a>';
  }).join('')+'<br>Disponible · '+fmt(Math.max(0,run.quantite_imprimee-reserved))+' ID';
}
function apActionDialog(title, markup, onSubmit, setup) {
  const dialog=document.createElement('dialog');
  dialog.id='apOrderPicker';
  dialog.className='panel p-5 space-y-4';
  dialog.setAttribute('aria-labelledby','apActionTitle');
  dialog.innerHTML='<h3 id="apActionTitle" class="font-bold">'+esc(title)+'</h3><form class="space-y-3">'+markup+
    '<p data-status role="status" class="text-sm"></p><div class="flex gap-2"><button class="btn btn-primary" type="submit">Enregistrer</button>'+
    '<button class="btn btn-secondary" type="button" data-close>Annuler</button></div></form>';
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  const form=dialog.querySelector('form'),button=form.querySelector('[type="submit"]');
  const status=dialog.querySelector('[data-status]');
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    button.disabled=true;
    try {
      const result=await onSubmit(form.elements);
      dialog.close();
      await loadAP();
      message(result);
    } catch(error) {
      if(dialog.open) status.textContent=error.message;
      else message(error.message,true);
    } finally { button.disabled=false; }
  });
  document.body.appendChild(dialog);
  setup?.(form.elements);
  dialog.showModal();
}
function remainingForPrint(order) {
  return order.quantite_demandee-orderRuns(order.id).reduce((sum,run)=>
    sum+Number(run.statut==='EN_COURS'?run.quantite_prevue:run.quantite_imprimee),0);
}
function startAPPrint(order) {
  if(!apProductSpec(order.type_produit)) return message('Renseignez le type de produit de cette commande.',true);
  const quantity=Math.min(1000,remainingForPrint(order));
  if(quantity<=0) return message('Aucune quantité disponible pour une nouvelle plage.',true);
  const busy=new Set(apState.runs.filter(run=>run.statut==='EN_COURS').map(run=>run.imprimante));
  const printers=[...new Set(apState.runs.map(run=>run.imprimante).filter(name=>name&&!busy.has(name)))].sort();
  const endFor=first=>APcalc.lastId(first,quantity);
  apActionDialog('Démarrer une plage · '+order.client,
    '<p class="text-sm">'+fmt(quantity)+' ID dans cette plage.</p>'+
    '<label class="lbl">Imprimante<input class="inp input-uppercase" name="printer" list="apAvailablePrinters" required maxlength="160"></label>'+
    '<datalist id="apAvailablePrinters">'+printers.map(name=>'<option value="'+esc(name)+'"></option>').join('')+'</datalist>'+
    '<label class="lbl">Premier ID<input class="inp font-mono-code" name="first" inputmode="numeric" placeholder="00 000 000" required maxlength="16"></label>'+
    '<label class="lbl">Dernier ID inclus<input class="inp font-mono-code" name="last" readonly></label>',
    async fields=>{
      const first=fields.first.value.trim(),last=endFor(first),printer=fields.printer.value.trim().toUpperCase();
      if(!last||!printer) throw new Error('Renseignez une imprimante et un premier ID valide sur 8 chiffres.');
      if(busy.has(printer)) throw new Error('Cette imprimante a déjà un tirage en cours. Validez-le avant de la réutiliser.');
      await saveRecord('ap_productions',{
        commande_id:order.id,statut:'EN_COURS',quantite_prevue:quantity,
        imprimante:printer,numero_debut:first,numero_fin:last,date_production:logitrakToday(),
      },null);
      return 'Plage enregistrée. Validez-la à la fin de l’impression.';
    }, fields=>{
      fields.first.addEventListener('input',()=>{fields.last.value=endFor(fields.first.value);});
    });
}
function shipAPOrder(order) {
  if(!apProductSpec(order.type_produit)) return message('Renseignez le type de produit de cette commande.',true);
  const available=orderRuns(order.id).some(run=>run.statut==='TERMINE'&&apState.shipments.filter(line=>line.ap_production_id===run.id).reduce((sum,line)=>sum+Number(line.quantite),0)<run.quantite_imprimee);
  if(!available) return message('Aucun tirage validé disponible pour un envoi.',true);
  location.assign('envois.html?new=1&commande-ap='+encodeURIComponent(order.id));
}

function orderAction(event) {
  const button=event.target.closest('[data-ap-action]');
  if(!button) return;
  if(button.dataset.apAction==='validate-run') {
    const run=apState.runs.find(row=>row.id===button.dataset.id);
    if(run) return validateAPPrint(run,button);
    return;
  }
  if(button.dataset.apAction==='trace-run') {
    const run=apState.runs.find(row=>row.id===button.dataset.id);
    if(run) openRunTrace(run);
    return;
  }
  const order=apState.orders.find(row=>row.id===button.dataset.id);
  if(!order) return;
  if(button.dataset.apAction==='start-print') return startAPPrint(order);
  if(button.dataset.apAction==='ship-order') return shipAPOrder(order);
  if(button.dataset.apAction==='delete-order') return deleteOrder(order,button);
  if(button.dataset.apAction==='edit-order') editOrder(order);
}
function showGate(html) { $('#gate').innerHTML=html; $('#gate').classList.remove('hidden'); $('#apApp').classList.add('hidden'); }
function loginGate() {
  showGate('<h3 class="font-bold">Connexion opérateur</h3><form onsubmit="doLogin(event)" class="space-y-3">'+
    '<input id="loginUsername" class="inp" required placeholder="Identifiant" aria-label="Identifiant" autocomplete="username">'+
    '<input id="loginPassword" type="password" class="inp" required placeholder="Mot de passe" aria-label="Mot de passe" autocomplete="current-password">'+
    '<p id="loginMsg" class="text-xs text-rose-400" role="status"></p><button type="submit" class="btn btn-primary">Se connecter</button></form>');
}
async function doLogin(event) {
  event.preventDefault(); const button=event.currentTarget.querySelector('button'); button.disabled=true;
  try {
    const {data,error}=await sb.auth.signInWithPassword({email:$('#loginUsername').value.trim().toLowerCase()+'@logitrak.internal',password:$('#loginPassword').value});
    if(error || !data?.session) { $('#loginMsg').textContent='Identifiant ou mot de passe incorrect.'; return; }
    $('#loginPassword').value = '';
    window.location.assign('index.html');
  } catch(error) { message(error.message,true); }
  finally { button.disabled=false; }
}
function isExpiredAPSession(error) {
  return error?.code === 'AP_SESSION_EXPIRED' ||
    ['refresh_token_not_found','refresh_token_already_used','session_not_found','session_expired'].includes(error?.code) ||
    /jwt expired|token (?:has )?expired|invalid refresh token/i.test(error?.message || '');
}
async function readAPWithSession(operation) {
  try { return await operation(); }
  catch(error) {
    if(!isExpiredAPSession(error)) throw error;
    const refreshed=await sb.auth.refreshSession();
    if(!refreshed.data?.session || refreshed.error) {
      throw Object.assign(new Error('Session expirée. Reconnectez-vous pour continuer.'),{code:'AP_SESSION_EXPIRED'});
    }
    return operation();
  }
}
function showAPLoadError(error) {
  console.warn(error);
  if(isExpiredAPSession(error)) {
    apState.admin=false;
    document.body.classList.remove('is-admin','is-operator');
    loginGate();
    $('#loginMsg').textContent='Session expirée. Reconnectez-vous pour continuer.';
    message('');
    return;
  }
  const missingSchema=['42P01','42703','PGRST204','PGRST205'].includes(error?.code);
  const help=missingSchema?'Vérifiez que les migrations Algérie Poste jusqu’à la v3.8 sont appliquées dans Supabase.':'Vérifiez la connexion, puis actualisez la page.';
  showGate('<h3 class="font-bold">Module indisponible</h3><p class="text-sm">'+esc(error.message||'Erreur de chargement')+
    '</p><p class="text-xs">'+help+'</p>');
  message('');
}
async function start() {
  try {
    const connected=await readAPWithSession(async()=>{
      const session=await sb.auth.getSession();
      if(session.error) throw session.error;
      const username=session.data.session?.user?.email?.split('@')[0];
      if(!username) { loginGate(); return false; }
      const {data,error}=await sb.from('operateurs').select('role').eq('username',username).maybeSingle();
      if(error) throw error;
      apState.admin=data?.role==='admin';
      document.body.classList.toggle('is-admin',apState.admin);
      document.body.classList.toggle('is-operator',!!data);
      if(!data) { showGate('<p>Compte opérateur requis.</p>'); return false; }
      message('Chargement des commandes Algérie Poste…');
      await loadAP();
      return true;
    });
    if(!connected) { message(''); return; }
    resetOrder(); $('#gate').classList.add('hidden'); $('#apApp').classList.remove('hidden'); message('');
    const requested=new URLSearchParams(location.search).get('impression');
    const order=apState.orders.find(row=>row.id===requested);
    if(order) startAPPrint(order);
  } catch(error) { showAPLoadError(error); }
}
document.addEventListener('DOMContentLoaded',()=>{
  syncThemeIcon();
  $('#apOrderForm').addEventListener('submit',saveOrder);
  $('#apOrderCancel').addEventListener('click',resetOrder);
  $('#apCategory').addEventListener('change',()=>{ $('#apSubtype').value=''; fillSubtypes(); });
  $('#apSearch').addEventListener('input',renderOrders); $('#apFilter').addEventListener('change',renderOrders);
  $('#apOrders').addEventListener('click',orderAction);
  $('#apActive').addEventListener('click',orderAction);
  $('#apPrintOrder').addEventListener('change',event=>{ $('#apPrintStart').disabled=!event.target.value; });
  $('#apPrintStart').addEventListener('click',()=>{
    const order=apState.orders.find(row=>row.id===$('#apPrintOrder').value);
    if(order) startAPPrint(order);
  });
  for(const id of ['apTraceId','apTraceSearch','apTraceMachine','apTraceState']) $('#'+id).addEventListener('input',renderTrace);
  $('#apReload').addEventListener('click',async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    try { await readAPWithSession(loadAP); message('Données actualisées.'); }
    catch(error) { if(isExpiredAPSession(error)) showAPLoadError(error); else message(error.message,true); }
    finally { button.disabled=false; }
  });
  try {
    const get=key=>{try{return localStorage.getItem(key);}catch{return null;}};
    sb=window.supabase.createClient(get('supabase_url')||SUPABASE_URL,get('supabase_key')||SUPABASE_ANON);
    start();
  } catch(error) { showGate('<p>Connexion à la base indisponible.</p>'); }
});
