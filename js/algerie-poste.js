const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => Number(value || 0).toLocaleString('fr-FR');
const apState = { orders: [], runs: [], history: [], admin: false, orderEdit: null, runEdit: null };
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
function running(id, excludeId) { return orderRuns(id).filter(run=>!APtrace.completed(run) && run.id!==excludeId).reduce((sum,row)=>sum+row.quantite_prevue,0); }
function availableToStart(order) { return Math.max(0,order.quantite_demandee-printed(order.id)-running(order.id)); }
function runStateLabel(run) { return APtrace.completed(run) ? 'Terminé / validé' : 'En cours'; }
function runBadge(run) { return '<span class="badge" style="background:var(--'+(APtrace.completed(run)?'success':'warning')+'-bg);color:var(--'+(APtrace.completed(run)?'success':'warning')+')">'+runStateLabel(run)+'</span>'; }
function runReference(run) { return run.id.slice(0,8).toUpperCase(); }
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
function resetRun() {
  apState.runEdit = null;
  $('#apRunForm').reset();
  $('#apRunDate').value = logitrakToday();
  $('#apRunOrder').disabled = false;
  $('#apRunTitle').textContent = 'Démarrer une impression';
  $('#apRunCancel').classList.add('hidden');
  updatePreview();
}
function fillSubtypes() {
  const category = $('#apCategory').value;
  const defaults = category === 'NATIONAL' ? ['Régime intérieur RR 2 exemplaires', 'Régime intérieur RR 3 exemplaires', 'Régime intérieur RC Grand-comptes 2EX'] : [];
  const values = [...new Set([...defaults, ...apState.orders.filter(o => o.categorie === category).map(o => o.sous_categorie)])];
  $('#apSubtypes').innerHTML = values.map(value => '<option value="' + esc(value) + '">').join('');
}
async function loadAP() {
  const [orders, runs, history] = await Promise.all([
    readLogiTrakRows(sb, 'ap_commandes'), readLogiTrakRows(sb, 'ap_productions'), readLogiTrakRows(sb, 'ap_historique'),
  ]);
  if (runs.some(run=>!run.statut)) throw new Error('Installez la migration sql/v37-tracabilite-algerie-poste.sql.');
  apState.history = history.sort((a,b)=>b.horodatage.localeCompare(a.horodatage)||b.id.localeCompare(a.id));
  apState.orders = orders.sort((a,b) => b.date_commande.localeCompare(a.date_commande) || b.created_at.localeCompare(a.created_at));
  apState.runs = runs.sort((a,b) => a.date_production.localeCompare(b.date_production) || a.created_at.localeCompare(b.created_at));
  const selected = $('#apRunOrder').value;
  $('#apRunOrder').innerHTML = '<option value="">Choisir une commande</option>' + orders.map(order =>
    '<option value="' + esc(order.id) + '">' + esc(order.client + ' · ' + order.sous_categorie + ' · ' + order.date_commande) + '</option>').join('');
  if (orders.some(order => order.id === selected)) $('#apRunOrder').value = selected;
  $('#apClients').innerHTML = [...new Set(orders.map(o => o.client))].sort().map(value => '<option value="' + esc(value) + '">').join('');
  const printers = [...new Set([...runs, ...history.flatMap(event=>[event.avant,event.apres].filter(Boolean))].map(run=>run.imprimante).filter(Boolean))].sort();
  $('#apPrinters').innerHTML=printers.map(value=>'<option value="'+esc(value)+'">').join('');
  const machine=$('#apTraceMachine').value;
  $('#apTraceMachine').innerHTML='<option value="">Toutes les imprimantes</option>'+printers.map(value=>'<option value="'+esc(value)+'">'+esc(value)+'</option>').join('');
  if(printers.includes(machine)) $('#apTraceMachine').value=machine;
  fillSubtypes(); renderOrders(); renderTrace(); updatePreview();
}
function renderOrders() {
  $('#apCount').textContent=fmt(apState.orders.length);
  $('#apRequested').textContent=fmt(apState.orders.reduce((sum,o)=>sum+o.quantite_demandee,0));
  $('#apPrinted').textContent=fmt(apState.runs.filter(run=>APtrace.completed(run)).reduce((sum,row)=>sum+row.quantite_imprimee,0));
  $('#apRemaining').textContent=fmt(apState.orders.reduce((sum,o)=>sum+Math.max(0,o.quantite_demandee-printed(o.id)),0));
  const search=$('#apSearch').value.trim().toLocaleLowerCase('fr'), filter=$('#apFilter').value;
  $('#apOrders').innerHTML=apState.orders.filter(order=>(!filter||filter===order.categorie)&&
    (!search||[order.client,order.sous_categorie,order.date_commande].join(' ').toLocaleLowerCase('fr').includes(search))
  ).map(order=>{
    const total=printed(order.id), active=running(order.id), remaining=Math.max(0,order.quantite_demandee-total);
    const status=total>order.quantite_demandee?'Surproduction de '+fmt(total-order.quantite_demandee)+' ID':
      remaining?(total||active?'En cours':'À imprimer'):'Imprimée';
    return '<article class="panel overflow-hidden"><div class="p-4 flex flex-wrap items-center justify-between gap-3">'+
      '<div><h4 class="font-bold">'+esc(order.client)+'</h4><p class="text-xs" style="color:var(--text-muted)">'+
      esc(categoryLabel(order.categorie)+' · '+order.sous_categorie+' · '+order.date_commande)+'</p>'+
      '<p class="text-sm mt-2">Demandés <b>'+fmt(order.quantite_demandee)+'</b> · Imprimés et validés <b>'+fmt(total)+
      '</b> · En cours <b>'+fmt(active)+'</b> · Reste à imprimer <b>'+fmt(remaining)+'</b> ID</p>'+
      '<p class="text-xs mt-1">'+esc(status)+' · Disponible pour un nouveau tirage : '+fmt(availableToStart(order))+' ID</p>'+
      (order.observations?'<p class="text-xs mt-1">'+esc(order.observations)+'</p>':'')+'</div>'+
      '<div class="flex flex-wrap gap-2"><button class="btn btn-primary" data-ap-action="produce" data-id="'+esc(order.id)+'">Démarrer une impression</button>'+
      '<button class="btn btn-secondary" data-ap-action="print" data-id="'+esc(order.id)+'">Colisage / Imprimer</button>'+
      (canEdit(order)?'<button class="btn btn-secondary" data-ap-action="edit-order" data-id="'+esc(order.id)+'">Modifier</button> '+
      '<button class="btn btn-secondary" data-ap-action="delete-order" data-id="'+esc(order.id)+'">Supprimer</button>':'')+
      '</div></div><div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr>'+
      '<th class="p-3 text-left">Tirage / dates</th><th class="p-3 text-left">Imprimante</th><th class="p-3 text-left">Quantité et plage</th>'+
      '<th class="p-3 text-left">Colisage / validation</th><th class="p-3">Terminé</th><th class="p-3">Actions</th></tr></thead><tbody>'+
      (orderRuns(order.id).map(run=>'<tr><td class="p-3"><b title="'+esc(run.id)+'">'+esc(runReference(run))+'</b><div>'+esc(run.date_production)+
      '</div><div class="mt-1">'+runBadge(run)+'</div><div class="mt-1">Début / saisie : '+esc(APtrace.timestamp(run.demarre_at||run.created_at))+
      '</div><div>Opérateur : '+esc(run.created_by||'Non renseigné')+'</div></td><td class="p-3 font-bold">'+esc(run.imprimante||'Non renseignée (historique)')+
      '</td><td class="p-3"><b>'+fmt(APtrace.quantity(run))+' ID'+(APtrace.completed(run)?' imprimés':' prévus')+
      '</b><div class="font-mono-code mt-1">'+esc(run.numero_debut)+' → '+esc(run.numero_fin||'À compléter')+'</div>'+
      (run.observations?'<div class="mt-1">'+esc(run.observations)+'</div>':'')+'</td><td class="p-3">'+
      (APtrace.completed(run)?esc(APcalc.packingText(run.quantite_imprimee)):'Colisage à valider après impression')+
      '<div class="mt-1">'+esc(runValidation(run))+'</div></td><td class="p-3 text-center"><input type="checkbox" class="w-5 h-5" data-ap-complete="'+
      esc(run.id)+'" aria-label="Valider le tirage '+esc(runReference(run))+'" '+(APtrace.completed(run)?'checked ':'')+(canEdit(run)?'':'disabled')+'></td><td class="p-3">'+
      (canEdit(run)?'<button class="btn btn-secondary" data-ap-action="edit-run" data-id="'+esc(run.id)+'">Modifier</button> '+
      '<button class="btn btn-secondary" data-ap-action="delete-run" data-id="'+esc(run.id)+'">Supprimer</button>':'Verrouillé après 48 h')+
      '</td></tr>').join('')||'<tr><td colspan="6" class="p-4">Aucune impression enregistrée.</td></tr>')+'</tbody></table></div></article>';
  }).join('')||'<p class="panel p-5 text-sm">Aucune commande à afficher.</p>';
}
function updatePreview() {
  const completed=$('#apRunFinished').checked, qty=Number($('#apRunQty').value);
  $('#apRunQtyLabel').textContent=completed?'Quantité réellement imprimée (ID) *':'Quantité prévue du tirage (ID) *';
  $('#apLast').required=completed;
  $('#apLastRequired').textContent=completed?'*':'(à compléter à la fin)';
  $('#apRunSave').textContent=completed?'Enregistrer et valider l’impression':apState.runEdit?'Enregistrer le tirage en cours':'Démarrer l’impression';
  const valid=Number.isSafeInteger(qty)&&qty>0;
  $('#apPackingPreview').textContent=valid?(completed?'Colisage validé : ':'Colisage prévu : ')+APcalc.packingText(qty):'Paquets de 1 000 ID. Un dernier paquet peut être incomplet.';
  const first=$('#apFirst').value.trim(),last=$('#apLast').value.trim();
  $('#apRangeHint').textContent=completed&&valid
    ? APcalc.rangeError(first,last,qty)||(APcalc.numericRange(first,last)?'Plage numérique cohérente.':'Plage alphanumérique : vérification manuelle des numéros.')
    : 'La quantité imprimée et le dernier numéro seront confirmés lorsque vous cocherez Impression terminée.';
  const order=apState.orders.find(o=>o.id===$('#apRunOrder').value);
  const otherPrinted=order?printed(order.id)-(apState.runEdit&&APtrace.completed(apState.runEdit)?apState.runEdit.quantite_imprimee:0):0;
  const otherRunning=order?running(order.id,apState.runEdit?.id):0;
  $('#apRunOrderHint').textContent=order?'Demandés : '+fmt(order.quantite_demandee)+' · Autres tirages validés : '+fmt(otherPrinted)+
    ' · Autres tirages en cours : '+fmt(otherRunning)+' ID'+(qty+otherPrinted+otherRunning>order.quantite_demandee?' · La quantité dépasse la commande.':''):'';
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
    const payload = {
      client: $('#apClient').value.trim().toUpperCase(), categorie: $('#apCategory').value,
      sous_categorie: $('#apSubtype').value.trim(), quantite_demandee: Number($('#apQty').value),
      date_commande: $('#apOrderDate').value, observations: $('#apOrderNotes').value.trim(),
    };
    if (!payload.client || !payload.sous_categorie || !Number.isSafeInteger(payload.quantite_demandee) || payload.quantite_demandee < 1) throw new Error('Renseignez le client, la sous-catégorie et une quantité entière positive.');
    const id = await saveRecord('ap_commandes',payload,apState.orderEdit);
    resetOrder(); await loadAP(); $('#apRunOrder').value=id; updatePreview(); message('Commande enregistrée.');
  });
}
async function saveRun(event) {
  event.preventDefault();
  await withButton($('#apRunSave'), async () => {
    const payload = {
      commande_id: $('#apRunOrder').value, date_production: $('#apRunDate').value,
      statut: $('#apRunFinished').checked ? 'TERMINE' : 'EN_COURS',
      imprimante: $('#apPrinter').value.trim().toUpperCase(),
      quantite_prevue: $('#apRunFinished').checked ? (apState.runEdit?.quantite_prevue || Number($('#apRunQty').value)) : Number($('#apRunQty').value),
      quantite_imprimee: $('#apRunFinished').checked ? Number($('#apRunQty').value) : 0,
      numero_debut: $('#apFirst').value.trim().toUpperCase(),
      numero_fin: $('#apLast').value.trim().toUpperCase(), observations: $('#apRunNotes').value.trim(),
    };
    const quantity=Number($('#apRunQty').value);
    if(!payload.commande_id||!payload.imprimante||!payload.numero_debut||!Number.isSafeInteger(quantity)||quantity<1) throw new Error('Choisissez une commande, une imprimante, le premier ID et une quantité entière positive.');
    const error=payload.statut==='TERMINE'?APcalc.rangeError(payload.numero_debut,payload.numero_fin,payload.quantite_imprimee):'';
    if (error) throw new Error(error);
    await saveRecord('ap_productions',payload,apState.runEdit);
    resetRun(); await loadAP(); $('#apRunOrder').value=payload.commande_id; updatePreview(); message(payload.statut==='TERMINE'?'Impression validée. Machine, plage et opérateur enregistrés.':'Impression en cours enregistrée. Cochez Terminé à la fin du tirage.');
  });
}
function editOrder(order) {
  if (!canEdit(order)) return message('Modification réservée à l’administrateur après 48 h.', true);
  apState.orderEdit=order;
  for(const [id,key] of Object.entries({apClient:'client',apCategory:'categorie',apSubtype:'sous_categorie',apQty:'quantite_demandee',apOrderDate:'date_commande',apOrderNotes:'observations'})) $('#'+id).value=order[key];
  fillSubtypes(); $('#apOrderTitle').textContent='Modifier la commande UPW'; $('#apOrderCancel').classList.remove('hidden'); $('#apClient').focus();
}
function editRun(run) {
  if (!canEdit(run)) return message('Modification réservée à l’administrateur après 48 h.', true);
  apState.runEdit=run;
  for(const [id,key] of Object.entries({apRunOrder:'commande_id',apRunDate:'date_production',apRunQty:'quantite_imprimee',apFirst:'numero_debut',apLast:'numero_fin',apRunNotes:'observations'})) $('#'+id).value=run[key];
  $('#apRunQty').value=APtrace.quantity(run);
  $('#apPrinter').value=run.imprimante||'';
  $('#apRunFinished').checked=APtrace.completed(run);
  $('#apRunOrder').disabled=true; $('#apRunTitle').textContent='Modifier le tirage '+runReference(run); $('#apRunCancel').classList.remove('hidden'); updatePreview(); $('#apRunQty').focus();
}
async function deleteRecord(table,row) {
  if (!canEdit(row)) throw new Error('Modification réservée à l’administrateur après 48 h.');
  const prompt = table==='ap_commandes' ? 'Supprimer cette commande et toutes ses impressions ?' : 'Supprimer cette impression et son colisage ?';
  if (!window.confirm(prompt)) return;
  const {data,error}=await sb.from(table).delete().eq('id',row.id).eq('revision',row.revision).select('id').maybeSingle();
  if(error) throw error;
  if(!data) throw new Error('La fiche a changé. Actualisez les données.');
  resetOrder(); resetRun(); await loadAP(); message('Suppression enregistrée.');
}
function printOrder(order) {
  const runs=orderRuns(order.id).filter(run=>APtrace.completed(run)),total=printed(order.id);
  $('#apPrintSheet').innerHTML='<div class="print-brand"><img src="assets/logitrak-eurequat.jpg" alt="LogiTrak — Envoi et traçabilité" width="2752" height="1536"></div>'+
    '<h1>Algérie Poste · Production validée et colisage</h1><p><b>'+esc(order.client)+'</b> · '+esc(categoryLabel(order.categorie)+' · '+order.sous_categorie)+
    '</p><p>Commande du '+esc(order.date_commande)+' · '+fmt(order.quantite_demandee)+' ID demandés · '+fmt(total)+' ID imprimés et validés · '+
    fmt(Math.max(0,order.quantite_demandee-total))+' ID restants</p>'+
    '<table><thead><tr><th>Tirage / date</th><th>Imprimante</th><th>Quantité / plage</th><th>Validation</th><th>Colisage</th></tr></thead><tbody>'+
    (runs.map(run=>'<tr><td>'+esc(runReference(run))+'<br>'+esc(run.date_production)+'</td><td>'+esc(run.imprimante||'Non renseignée (historique)')+
      '</td><td>'+fmt(run.quantite_imprimee)+' ID<br>'+esc(run.numero_debut)+' → '+esc(run.numero_fin)+'</td><td>'+esc(runValidation(run))+
      '<br>Saisi par '+esc(run.created_by||'Non renseigné')+'</td><td>'+esc(APcalc.packingText(run.quantite_imprimee))+'</td></tr>').join('')||
      '<tr><td colspan="5">Aucun tirage validé.</td></tr>')+'</tbody></table><p>Total colisage validé : '+
    fmt(runs.reduce((sum,run)=>sum+APcalc.packing(run.quantite_imprimee).packages,0))+' paquet(s). Chaque tirage est conditionné séparément.</p>';
  printLogiTrakDocument($('#apPrintSheet'));
}
async function toggleRunCompletion(event) {
  const checkbox=event.target.closest('[data-ap-complete]');
  if(!checkbox) return;
  const run=apState.runs.find(row=>row.id===checkbox.dataset.apComplete);
  if(!run) return;
  const target=checkbox.checked;
  checkbox.checked=APtrace.completed(run);
  if(!canEdit(run)) return message('Modification réservée à l’administrateur après 48 h.',true);
  if(target&&(!run.imprimante||!run.numero_fin||APcalc.rangeError(run.numero_debut,run.numero_fin,run.quantite_prevue))) {
    editRun(run);
    $('#apRunFinished').checked=true;
    updatePreview();
    $('#apRunForm').scrollIntoView({block:'center'});
    $('#apLast').focus();
    return message('Confirmez la quantité réellement imprimée, la machine et le dernier numéro, puis enregistrez pour valider.');
  }
  await withButton(checkbox,async()=>{
    await saveRecord('ap_productions',{
      statut:target?'TERMINE':'EN_COURS',
      quantite_prevue:target?run.quantite_prevue:run.quantite_imprimee,
      quantite_imprimee:target?run.quantite_prevue:0,
    },run);
    await loadAP();
    message(target?'Impression validée avec date, machine et opérateur.':'Tirage remis en cours. La modification est conservée dans l’historique.');
  });
}
async function orderAction(event) {
  const button=event.target.closest('[data-ap-action]'); if(!button) return;
  const action=button.dataset.apAction, id=button.dataset.id;
  const order=apState.orders.find(row=>row.id===id), run=apState.runs.find(row=>row.id===id);
  if(action==='edit-order' && order) return editOrder(order);
  if(action==='edit-run' && run) return editRun(run);
  if(action==='print' && order) return printOrder(order);
  if(action==='produce' && order) { resetRun(); $('#apRunOrder').value=order.id; $('#apRunQty').value=availableToStart(order)||''; updatePreview(); $('#apRunQty').focus(); return; }
  if(action==='delete-order' && order) return withButton(button,()=>deleteRecord('ap_commandes',order));
  if(action==='delete-run' && run) return withButton(button,()=>deleteRecord('ap_productions',run));
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
async function start(session) {
  try {
    const current=session===undefined ? (await sb.auth.getSession()).data.session : session;
    const username=current?.user?.email?.split('@')[0];
    if(!username) { loginGate(); return; }
    const {data,error}=await sb.from('operateurs').select('role').eq('username',username).maybeSingle();
    if(error) throw error;
    apState.admin=data?.role==='admin';
    document.body.classList.toggle('is-admin',apState.admin);
    document.body.classList.toggle('is-operator',!!data);
    if(!data) { showGate('<p>Compte opérateur requis.</p>'); return; }
    $('#gate').classList.add('hidden');
    message('Chargement des commandes Algérie Poste…');
    await loadAP(); resetOrder(); resetRun(); $('#apApp').classList.remove('hidden'); message('');
    const requested = new URLSearchParams(location.search);
    if (requested.get('production') === '1' && requested.get('commande')) {
      const order = apState.orders.find(row => row.id === requested.get('commande'));
      if (!order) message('Commande introuvable. Choisissez une commande dans la liste.', true);
      else if (availableToStart(order) <= 0) message('La quantité de cette commande est déjà imprimée ou affectée à des tirages en cours. Vérifiez les tirages existants.', true);
      else {
        $('#apRunOrder').value = order.id;
        $('#apRunQty').value = availableToStart(order);
        updatePreview();
        $('#apRunForm').scrollIntoView({block:'center'});
        $('#apFirst').focus({preventScroll:true});
        message('Commande sélectionnée. Vérifiez la quantité à imprimer et renseignez les numéros de début et de fin.');
      }
      history.replaceState(null, '', location.pathname);
    }
  } catch(error) {
    console.warn(error);
    showGate('<h3 class="font-bold">Module indisponible</h3><p class="text-sm">'+esc(error.message)+
      '</p><p class="text-xs">Vérifiez la connexion et l’installation de la mise à jour sql/v37-tracabilite-algerie-poste.sql dans Supabase.</p>');
    message('');
  }
}
document.addEventListener('DOMContentLoaded',()=>{
  syncThemeIcon();
  $('#apOrderForm').addEventListener('submit',saveOrder);
  $('#apRunForm').addEventListener('submit',saveRun);
  $('#apOrderCancel').addEventListener('click',resetOrder);
  $('#apRunCancel').addEventListener('click',resetRun);
  $('#apCategory').addEventListener('change',()=>{ $('#apSubtype').value=''; fillSubtypes(); });
  for(const id of ['apRunQty','apFirst','apLast','apRunOrder']) $('#'+id).addEventListener('input',updatePreview);
  $('#apSearch').addEventListener('input',renderOrders); $('#apFilter').addEventListener('change',renderOrders);
  $('#apOrders').addEventListener('click',orderAction);
  $('#apOrders').addEventListener('change',toggleRunCompletion);
  $('#apRunFinished').addEventListener('change',updatePreview);
  for(const id of ['apTraceId','apTraceSearch','apTraceMachine','apTraceState']) $('#'+id).addEventListener('input',renderTrace);
  $('#apReload').addEventListener('click',event=>withButton(event.currentTarget,async()=>{await loadAP();message('Données actualisées.');}));
  try {
    const get=key=>{try{return localStorage.getItem(key);}catch{return null;}};
    sb=window.supabase.createClient(get('supabase_url')||SUPABASE_URL,get('supabase_key')||SUPABASE_ANON);
    start();
  } catch(error) { showGate('<p>Connexion à la base indisponible.</p>'); }
});
