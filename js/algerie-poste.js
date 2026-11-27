const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => Number(value || 0).toLocaleString('fr-FR');
const apState = { orders: [], runs: [], shipments: [], admin: false, orderEdit: null, username: '', tab: 'commandes' };
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
  const el = $('#apMessage');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('hidden', !text);
  el.style.color = error ? 'var(--danger)' : 'var(--text-muted)';
}
function switchAPTab(tab) {
  if(tab==='statistiques'&&(apState.viewer||!apState.username)) return;
  apState.tab = tab;
  $$('[data-ap-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.apTab === tab));
  ['commandes', 'production', 'historique','statistiques','expedition'].forEach(name => {
    const box = $('#apTab_' + name);
    if (box) box.classList.toggle('hidden', name !== tab);
  });
}
function canEditOrder(order) {
 return !apState.viewer && (apState.admin || (!!apState.username && order.created_by===apState.username));
}
function canEdit(row) {
  return !apState.viewer && (apState.admin || Date.now() - new Date(row.created_at).getTime() < 24 * 3600000);
}
function orderRuns(id) { return apState.runs.filter(row => row.commande_id === id); }
function printed(id) { return orderRuns(id).filter(run => APtrace.completed(run)).reduce((sum, row) => sum + Number(row.quantite_imprimee || 0), 0); }
function shippedForRun(runId) {
  return apState.shipments.filter(line => line.ap_production_id === runId).reduce((sum, line) => sum + Number(line.quantite || 0), 0);
}
function remainingForPrint(order) {
  return order.quantite_demandee - orderRuns(order.id).reduce((sum, run) =>
    sum + Number(run.statut === 'EN_COURS' ? run.quantite_prevue : run.quantite_imprimee), 0);
}

// Calcule automatiquement le prochain numéro d'ID à reprendre après tous les paquets (terminés ou en cours) de la commande
function nextStartIdForOrder(orderId) {
  const runs = orderRuns(orderId);
  let maxEnd = null;
  let padLen = 8;
  for (const r of runs) {
    const rawEnd = String(r.numero_fin || '').replace(/\s/g, '');
    if (/^\d+$/.test(rawEnd)) {
      const val = BigInt(rawEnd);
      if (maxEnd === null || val > maxEnd) {
        maxEnd = val;
        padLen = rawEnd.length || 8;
      }
    }
  }
  if (maxEnd === null) return '';
  const nextVal = maxEnd + 1n;
  const s = String(nextVal).padStart(padLen, '0');
  return s.length === 8 ? s.replace(/^(\d{2})(\d{3})(\d{3})$/, '$1 $2 $3') : s;
}

// Quantité déjà planifiée/produite sur une commande (pour afficher le rang exact De / À)
function alreadyPlannedForOrder(orderId) {
  return orderRuns(orderId).reduce((sum, run) =>
    sum + Number(run.statut === 'EN_COURS' ? run.quantite_prevue : run.quantite_imprimee), 0);
}


function newOrderPrerequisites() {
  if(apState.admin || apState.orderEdit) return [];
  const ownOrders=apState.orders.filter(order=>order.created_by===apState.username);
  const blocked=ownOrders.filter(order=>!order.autorise_nouvelle_commande && printed(order.id)<Number(order.quantite_demandee));
  const reasons=blocked.map(order=>'Terminez '+(order.ap_numero||'la commande')+' · '+order.client+' : '+fmt(Math.max(0,Number(order.quantite_demandee)-printed(order.id)))+' ID restent à valider, ou demandez l’autorisation d’un administrateur.');
  const active=apState.runs.filter(run=>run.created_by===apState.username&&run.statut==='EN_COURS');
  if(blocked.length && active.length) reasons.push('Impressions en cours : '+active.map(run=>run.imprimante+' (De '+run.numero_debut+' à '+run.numero_fin+')').join(' ; ')+'. Validez uniquement les impressions réellement terminées dans Production.');
  return reasons;
}
function renderOrderPrerequisites() {
  const form=$('#apOrderForm');if(!form)return;
  let notice=$('#apOrderPrerequisites');
  if(!notice){notice=document.createElement('div');notice.id='apOrderPrerequisites';notice.setAttribute('role','status');notice.style.cssText='padding:12px 14px;border:1px solid #f59e0b;border-radius:10px;background:#fff7e6;color:#7c3a0a;font-size:13px;line-height:1.6;white-space:pre-line';form.prepend(notice);}
  const reasons=newOrderPrerequisites();notice.hidden=!reasons.length;
  notice.textContent=reasons.length?'Avant de créer une nouvelle commande :\n'+reasons.join('\n'):'';
}

function resetOrder() {
  if ($('#apOrderEditor')) $('#apOrderEditor').open = false;
  apState.orderEdit = null;
  $('#apOrderForm').reset();
  $('#apNumberField').hidden=true;
  $('#apOrderDate').value = logitrakToday();
  $('#apOrderTitle').innerHTML = '<i class="fa-solid fa-plus text-amber-500 mr-1.5"></i>Nouvelle commande UPW';
  $('#apOrderCancel').classList.add('hidden');
  fillSubtypes();
  renderOrderPrerequisites();
}
function fillSubtypes(selected = '') {
  const category = $('#apCategory').value;
  $('#apSubtype').innerHTML = '<option value="">Choisir un produit</option>' + Object.entries(APproducts)
    .filter(([, product]) => product.category === category)
    .map(([code, product]) => '<option value="' + code + '">' + esc(product.label + ' · ' + product.copies + ' exemplaires') + '</option>').join('');
  $('#apSubtype').value = selected;
}

async function syncAPClock() {
  const {data,error}=await sb.rpc('ap_server_time_ms');
  if(error||!Number.isFinite(Number(data))||data===null) throw error||new Error('Horloge Supabase indisponible.');
  apState.clock={server:Number(data),local:performance.now()};
}
function apNow() {
  return apState.clock?apState.clock.server+performance.now()-apState.clock.local:NaN;
}
async function loadAP() {
  await syncAPClock().catch(console.warn);
  const [orders, runs, shipments, machines] = await Promise.all([
    readLogiTrakRows(sb, 'ap_commandes'),
    readLogiTrakRows(sb, 'ap_productions'),
    readLogiTrakRows(sb, 'lignes_expedition', 'id,ap_production_id,quantite,expedition_id,expeditions(numero_bl,validation,date_envoi)'),
    readLogiTrakRows(sb, 'machines_usine').catch(error=>{
      if(['42P01','PGRST205'].includes(error.code)) return [];
      throw error;
    }),
  ]);
  apState.shipments = shipments.filter(line => line.ap_production_id);
  apState.packingGroups = await APGrouping.load(sb);
  apState.machines=machines;
  apState.orders = orders.sort((a, b) => b.date_commande.localeCompare(a.date_commande) || b.created_at.localeCompare(a.created_at));
  apState.runs = runs.sort((a, b) => a.date_production.localeCompare(b.date_production) || a.created_at.localeCompare(b.created_at));

  $('#apClients').innerHTML = [...new Set(orders.map(o => o.client))].sort().map(value => '<option value="' + esc(value) + '">').join('');
  const printers = [...new Set(runs.map(run => run.imprimante).filter(Boolean))].sort();
  const machine = $('#apTraceMachine').value;
  $('#apTraceMachine').innerHTML = '<option value="">Toutes les machines</option>' + printers.map(value => '<option value="' + esc(value) + '">' + esc(value) + '</option>').join('');
  if (printers.includes(machine)) $('#apTraceMachine').value = machine;

  await refreshStations();
  renderKPIs();
  renderAPStats();
  updatePrintingWarning();
  await loadAPNotices().catch(console.warn);
  renderOrders();
  renderOrderPrerequisites();
  renderProductionTab();
  renderSimpleHistory();
}

async function refreshStations() {
  if(apState.viewer) return;
  const {data,error}=await sb.from('ap_reservations_postes').select('poste,operateur');
  if(error) throw error;
  apState.station=data.find(row=>row.operateur===apState.username)?.poste||'';
  const picker=$('#apWorkstation');
  for(const option of picker.options) {
    if(!option.value) continue;
    const owner=data.find(row=>row.poste===option.value)?.operateur;
    option.disabled=!!owner&&owner!==apState.username;
    option.textContent=option.value+(option.disabled?' · Réservé par '+owner:'');
  }
  const adminStations=$('#apAdminStations');
  adminStations.replaceChildren();
  if(apState.admin) for(const row of data) {
    if(row.operateur===apState.username) continue;
    const release=document.createElement('button');
    release.type='button'; release.className='btn btn-secondary';
    release.textContent='Libérer '+row.poste+' ('+row.operateur+')';
    release.onclick=()=>changeStation(row.poste,true);
    adminStations.append(release);
  }
  picker.value=apState.station;
  picker.disabled=!!apState.station;
  $('#apReleaseStation').hidden=!apState.station;
}
async function changeStation(station,release) {
  const picker=$('#apWorkstation'), button=$('#apReleaseStation'), status=$('#apStationStatus');
  picker.value=apState.station||'';
  if(!station||!window.confirm((release?'Libérer ':'Réserver ')+station+' ?')) return;
  picker.disabled=true;
  button.disabled=true;
  status.textContent='';
  try {
    const {error}=await sb.rpc('ap_reserver_poste',{p_poste:station,p_liberer:release});
    if(error) throw error;
    status.textContent=release?'Poste libéré.':'Poste réservé à votre compte.';
  } catch(error) { status.textContent=error.message; }
  try { await refreshStations(); }
  catch(error) { status.textContent=error.message; }
  finally {
    picker.disabled=!!apState.station;
    button.disabled=false;
    $('#apPrintRows').replaceChildren();
    renderProductionTab();
  }
}
function printUnlockTime(run) {
  const previous=apState.runs.filter(row=>row.id!==run.id&&row.imprimante===run.imprimante&&row.termine_at);
  return Math.max(Date.parse(run.created_at),...previous.map(row=>Date.parse(row.termine_at)))+300000;
}
function updatePrintCountdowns() {
  for(const timer of document.querySelectorAll('[data-ap-unlock]')) {
    const left=Math.max(0,Math.ceil((Number(timer.dataset.apUnlock)-apNow())/1000));
    timer.textContent=!Number.isFinite(left)?'Heure indisponible':left?String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0'):'Validation possible';
  }
}
function workstationPrinters() {
  const station=apState.station||'';
  if(!station) return [];
  const names=station==='Poste02'?['IMP05','IMP06']:['IMP01','IMP02','IMP03','IMP04'];
  return names.filter(name=>!apState.machines.some(machine=>machine.nom===name&&machine.etat!=='En service'));
}
function updatePrintingWarning() {
  const active=apState.runs.filter(run=>run.statut==='EN_COURS'&&run.created_by===apState.username);
  const hour=Number(new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',hourCycle:'h23',timeZone:'Africa/Algiers'}).format(new Date()));
  const late=active.filter(run=>Date.now()-Date.parse(run.created_at)>=900000);
  $('#apPrintingWarning').textContent=[
    active.length&&hour>=16?'Il est 16 h passées. Avez-vous validé toutes vos impressions ?':'',
    late.length?'Impression en cours depuis au moins 15 min sur '+late.map(run=>run.imprimante).join(', ')+'.':''
  ].filter(Boolean).join(' ');
}
async function loadAPNotices() {
  const {data,error}=await sb.from('ap_notifications').select('*').order('cree_at',{ascending:false}).limit(10);
  if(error) throw error;
  $('#apNotices').innerHTML=data.map(note=>{
    const order=apState.orders.find(row=>row.id===note.commande_id);
    return '<p class="panel-soft p-2">Commande '+esc(order?.ap_numero||'Algérie Poste')+' démarrée par '+esc(note.auteur)+'.</p>';
  }).join('');
}
function statisticalRuns() {
  if(apState.viewer || !apState.username) return [];
  return apState.runs.filter(run=>APtrace.completed(run) && (apState.admin || run.created_by===apState.username));
}
function renderAPStats() {
  if(apState.viewer || !apState.username) return;
  const labels=['Opérateurs','Imprimantes','Postes de travail','Clients UPW','Types d’identifiants'];
  const groups=labels.map(()=>new Map());
  const orders=new Map(apState.orders.map(order=>[order.id,order]));
  const days=new Map();
  const today=logitrakToday();
  for(const run of statisticalRuns()) {
    if(run.date_production<=today) days.set(run.date_production,(days.get(run.date_production)||0)+Number(run.quantite_imprimee));
    const order=orders.get(run.commande_id);
    [run.created_by,run.imprimante,run.poste_travail,order?.client,apProductSpec(order?.type_produit)?.label||order?.sous_categorie].forEach((name,index)=>{
      const key=name||'Non renseigné';
      groups[index].set(key,(groups[index].get(key)||0)+Number(run.quantite_imprimee));
    });
  }
  const series=[...days].sort(([a],[b])=>a.localeCompare(b)).slice(-30);
  const max=Math.max(1,...series.map(([,qty])=>qty));
  const points=series.map(([,qty],i)=>[10+580*i/Math.max(1,series.length-1),105-95*qty/max]);
  let trend=series.length?'<svg class="ap-trend" viewBox="0 0 600 115" role="img" aria-label="Évolution des quantités produites par jour">'+
    '<polyline fill="none" stroke="#0284c7" stroke-width="2.5" points="'+points.map(point=>point.join(',')).join(' ')+'"/>'+
    points.map(([x,y],i)=>'<circle cx="'+x+'" cy="'+y+'" r="4" fill="#0284c7"><title>'+esc(series[i][0])+' · '+fmt(series[i][1])+' ID</title></circle>').join('')+
    '</svg><p class="text-xs">'+esc(series[0][0])+' au '+esc(series.at(-1)[0])+' · Pic '+fmt(max)+' ID</p>':'<p>Aucune production.</p>';
  if(!apState.admin && series.length) {
    const vivid=['#008cff','#ff6b00','#9333ea','#00a96b','#e91e63','#e4b000'];
    const barWidth=48,step=82,width=Math.max(620,series.length*step+65),height=265,base=215,plotHeight=170;
    const grid=[0,.25,.5,.75,1].map(ratio=>{
      const y=base-plotHeight*ratio;
      return '<line x1="58" y1="'+y+'" x2="'+(width-8)+'" y2="'+y+'" stroke="currentColor" opacity=".13"/><text x="50" y="'+(y+4)+'" text-anchor="end" fill="currentColor" font-size="11">'+fmt(Math.round(max*ratio))+'</text>';
    }).join('');
    const bars=series.map(([date,qty],i)=>{
      const x=70+i*step,h=plotHeight*qty/max,y=base-h,color=vivid[i%vivid.length];
      return '<g><title>'+esc(date)+' : '+fmt(qty)+' ID</title><rect x="'+x+'" y="'+y+'" width="'+barWidth+'" height="'+h+'" rx="6" fill="'+color+'"/><text x="'+(x+barWidth/2)+'" y="'+(y-9)+'" text-anchor="middle" fill="currentColor" font-size="12" font-weight="800">'+fmt(qty)+'</text><text x="'+(x+barWidth/2)+'" y="'+(base+23)+'" text-anchor="middle" fill="currentColor" font-size="12">'+esc(date.slice(8,10)+'/'+date.slice(5,7))+'</text></g>';
    }).join('');
    trend='<div style="overflow-x:auto;color:var(--text);margin-top:12px"><svg role="img" aria-label="Histogramme de ma production quotidienne en identifiants" viewBox="0 0 '+width+' '+height+'" style="display:block;width:100%;min-width:'+width+'px;height:auto;min-height:265px">'+grid+bars+'</svg></div><p class="text-xs">'+esc(series[0][0])+' au '+esc(series.at(-1)[0])+' · Quantités en ID · Pic '+fmt(max)+' ID</p>';
  }
  const colors=['#0284c7','#ea580c','#7c3aed','#059669','#db2777'];
  $('#apTab_statistiques').innerHTML='<p class="text-sm font-bold mb-3">'+(apState.admin?'Statistiques globales Algérie Poste':'Mes statistiques')+'</p><section class="panel-soft p-4"><h3 class="font-bold">Production par jour</h3>'+trend+'</section>'+
    '<div class="grid md:grid-cols-2 gap-3 mt-4">'+groups.map((group,index)=>{
      if(!apState.admin && index===0) return ''; 
      const entries=[...group].filter(([,qty])=>qty>0).sort((a,b)=>b[1]-a[1]);
      const total=entries.reduce((sum,[,qty])=>sum+qty,0);
      let offset=0;
      const slices=entries.map(([name,qty],i)=>{
        const from=offset;
        offset+=100*qty/total;
        return {name,qty,color:colors[i%colors.length],from,to:offset};
      });
      const gradient=slices.map(slice=>slice.color+' '+slice.from+'% '+slice.to+'%').join(',');
      return '<section class="panel-soft p-4 space-y-3"><h3 class="font-bold">'+labels[index]+'</h3>'+
        (total?'<div class="ap-stat-layout"><div class="ap-stat-donut" style="background:conic-gradient('+gradient+')"><div><b>'+fmt(total)+'</b><small>ID au total</small></div></div>'+
          '<ul class="ap-stat-legend">'+slices.map(slice=>'<li><i style="background:'+slice.color+'"></i><span>'+esc(slice.name)+'</span><b>'+fmt(slice.qty)+' ID</b></li>').join('')+'</ul></div>':'<p>Aucune production.</p>')+'</section>'; 
    }).join('')+'</div>';
}
function renderKPIs() {
  const totalStock = apState.runs
    .filter(run => APtrace.completed(run))
    .reduce((sum, run) => sum + Math.max(0, Number(run.quantite_imprimee || 0) - shippedForRun(run.id)), 0);
  $('#apCount').textContent = fmt(apState.orders.length);
  $('#apRequested').textContent = fmt(apState.orders.reduce((sum, order) => sum + order.quantite_demandee, 0));
  $('#apInStock').textContent = fmt(totalStock);
  $('#apRemaining').textContent = fmt(apState.orders.reduce((sum, order) => sum + Math.max(0, order.quantite_demandee - printed(order.id)), 0));
}

/* ==================== 1. COMMANDES ==================== */
function renderOrders() {
  const search = $('#apSearch').value.trim().toLowerCase(), filter = $('#apFilter').value;
  const list = apState.orders.filter(order => (!filter || filter === order.categorie) &&
    (!search || [order.ap_numero, order.client, order.sous_categorie, order.date_commande].join(' ').toLowerCase().includes(search)));

  const opened = new Set([...$('#apOrdersList').querySelectorAll('details[open]')].map(node=>node.dataset.orderId));
  $('#apOrdersList').innerHTML = list.map(order => {
    const spec = apProductSpec(order.type_produit);
    const totalPrinted = printed(order.id);
    const rem = Math.max(0, order.quantite_demandee - totalPrinted);
    const card = '<div class="panel p-4 flex flex-wrap items-center justify-between gap-3">' +
      '<div class="space-y-1">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="font-mono-code font-bold text-amber-500">' + esc(order.ap_numero || 'APN') + '</span>' +
          '<b class="text-sm">' + esc(order.client) + '</b>' +
          '<span class="text-xs px-2 py-0.5 rounded-full" style="background:var(--bg-input);color:var(--text-muted)">' + esc(spec?.label || order.sous_categorie) + '</span>' +
          '<span class="text-xs" style="color:var(--text-muted)">' + esc(order.date_commande) + '</span>' +
        '</div>' +
        '<div class="text-xs" style="color:var(--text-muted)">Commandés : <b>' + fmt(order.quantite_demandee) + ' ID</b> · Produits : <b class="text-emerald-500">' + fmt(totalPrinted) + ' ID</b> · Reste à produire : <b class="text-amber-500">' + fmt(rem) + ' ID</b></div>' +
        '<p class="text-xs">Saisie par '+esc(order.created_by||'—')+'</p>'+
        (order.observations ? '<div class="text-xs italic" style="color:var(--text-dim)">' + esc(order.observations) + '</div>' : '') +
      '</div>' +
      '<div class="flex flex-wrap items-center gap-2">' +
        (rem > 0 ? '<button type="button" class="btn btn-primary op-only" data-ap-action="goto-prod" data-id="' + esc(order.id) + '"><i class="fa-solid fa-print"></i>Produire</button>' : '<span class="badge" style="background:rgba(16,185,129,.15);color:#34d399">Complète</span>') +
        (apState.admin&&rem>0?'<button class="btn btn-secondary" type="button" data-ap-action="permit-order" data-id="'+esc(order.id)+'">'+(order.autorise_nouvelle_commande?'Retirer l’autorisation':'Autoriser une nouvelle commande')+'</button>':'')+
        (canEditOrder(order) ? '<button type="button" class="btn btn-secondary" data-ap-action="edit-order" data-id="' + esc(order.id) + '">Modifier</button>' : '') +
        (apState.admin ?
        '<button type="button" class="btn btn-secondary" data-ap-action="delete-order" data-id="' + esc(order.id) + '">Supprimer</button>' : '') +
      '</div>' +
    '</div>';
    // Une impression active garde la commande entièrement visible.
    if(rem>0 || orderRuns(order.id).some(run=>run.statut==='EN_COURS')) return card;
    const ranges=orderRuns(order.id).filter(APtrace.completed).map(run=>({
      first:String(run.numero_debut||'').replace(/\s/g,''),last:String(run.numero_fin||'').replace(/\s/g,'')
    })).filter(range=>/^\d+$/.test(range.first)&&/^\d+$/.test(range.last))
      .sort((a,b)=>BigInt(a.first)<BigInt(b.first)?-1:BigInt(a.first)>BigInt(b.first)?1:0);
    const segments=[];
    for(const range of ranges){const previous=segments.at(-1);if(previous&&BigInt(previous.last)+1n===BigInt(range.first))previous.last=range.last;else segments.push({...range});}
    const displayNumber=value=>value.padStart(8,'0').replace(/^(\d{2})(\d{3})(\d{3})$/,'$1 $2 $3');
    const rangeText=segments.map(range=>'<span class="whitespace-nowrap"><span class="ap-range-word">De</span> '+esc(displayNumber(range.first))+' <span class="ap-range-word">à</span> '+esc(displayNumber(range.last))+'</span>').join(' · ');
    return '<details class="panel" data-order-id="'+esc(order.id)+'"'+(opened.has(order.id)?' open':'')+'>'+
      '<summary class="cursor-pointer p-4" style="font-size:13px;line-height:1.8">'+
      '<span>'+esc(order.date_commande)+'</span> · <b class="text-amber-500">'+esc(order.ap_numero||'APN')+'</b> · <b>'+esc(order.client)+'</b>'+
      (rangeText?' · '+rangeText:'')+' · <span class="badge" style="background:rgba(16,185,129,.15);color:var(--success)">Complète</span></summary>'+card+'</details>';
  }).join('') || '<p class="panel p-5 text-sm">Aucune commande à afficher.</p>';
}

/* ==================== 2. PRODUCTION & STOCK ==================== */
function renderProductionTab() {
  const picker = $('#apPrintOrder'), selected = picker.value;
  const printable = apState.orders.filter(order => apProductSpec(order.type_produit) && remainingForPrint(order) > 0)
    .sort((a,b)=>Number(b.created_by===apState.username)-Number(a.created_by===apState.username));
  picker.innerHTML = '<option value="">— Choisir une commande à produire —</option>' + printable.map(order =>
    '<option value="' + esc(order.id) + '">' + esc((order.ap_numero || 'APN') + ' · ' + order.client + ' · ' + apProductSpec(order.type_produit).label) + ' (' + fmt(remainingForPrint(order)) + ' ID disponibles)</option>'
  ).join('');
  if (printable.some(order => order.id === selected)) picker.value = selected;
  else picker.value=printable.find(order=>order.created_by===apState.username)?.id||'';
  if (!$('#apProdDate').value) $('#apProdDate').value = logitrakToday();

  setupInlineProductionForm();

  // Impressions en cours sur les machines
  const assigned=apState.station==='Poste01'?['IMP01','IMP02','IMP03','IMP04']:apState.station==='Poste02'?['IMP05','IMP06']:[];
  const active = apState.runs.filter(run => run.statut === 'EN_COURS' && (apState.admin || assigned.includes(run.imprimante)));
  $('#apActive').innerHTML = active.map(run => {
    const order = apState.orders.find(row => row.id === run.commande_id);
    const remOrder = order ? remainingForPrint(order) : 0;
    const nextStart = order && remOrder > 0 ? nextStartIdForOrder(order.id) : '';
    const nextQty = order && remOrder > 0 ? Math.min(1000, remOrder) : 0;
    const nextEnd = nextStart && nextQty > 0 ? APcalc.lastId(nextStart, nextQty) : '';
    return '<div class="panel-soft p-3 flex flex-wrap justify-between items-center gap-3">' +
      '<div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="ap-active-machine"><i class="fa-solid fa-print mr-1" aria-hidden="true"></i>' + esc(run.imprimante || 'Machine non renseignée') + '</span><span class="ap-running"><i aria-hidden="true"></i>En marche</span>' +
          '<b>' + esc(order?.ap_numero || '') + ' · ' + esc(order?.client || '') + '</b>' +
          '<span class="text-xs" style="color:var(--text-muted)">Opérateur : <b class="ap-operator">' + esc(run.created_by || '—') + '</b></span>' +
        '</div>' +
        '<p class="text-sm font-mono-code mt-2">Plage en cours : <b><span class="ap-range-word">De</span> ' + esc(run.numero_debut || '—') + ' <span class="ap-range-word">à</span> ' + esc(run.numero_fin || '—') + '</b> (' + fmt(run.quantite_prevue) + ' ID)</p>' +
      '</div>' +
      '<div class="flex flex-wrap gap-2">' +
        (canEdit(run) && nextStart && nextEnd ? '<button type="button" class="btn btn-primary" data-ap-action="validate-and-continue" data-id="' + esc(run.id) + '" title="Valide ce paquet et lance immédiatement la plage ' + esc(nextStart) + ' → ' + esc(nextEnd) + ' sur ' + esc(run.imprimante) + '"><i class="fa-solid fa-forward"></i>Valider &amp; lancer la suite (' + esc(nextStart) + ')</button>' : '') +
        '<span class="ap-print-countdown font-mono-code" data-ap-unlock="' + printUnlockTime(run) + '"></span>' +
        (canEdit(run) ? '<button type="button" class="btn btn-secondary" data-ap-action="validate-run" data-id="' + esc(run.id) + '"><i class="fa-solid fa-check text-emerald-400"></i>Valider et stocker</button>' : '') +
      '</div></div>';
  }).join('') || '<p class="text-xs" style="color:var(--text-muted)">Aucune impression en cours sur les machines.</p>';

  updatePrintCountdowns();
  // Stock des paquets produits & colisage par commande
  const stockHtml = [];
  const displayedGroups = new Set();
  for (const order of apState.orders) {
    let membership=APGrouping.groupFor(order.id,apState.packingGroups||[]);
    if(membership){const reserved=new Map(apState.runs.map(run=>[run.id,shippedForRun(run.id)]));const live=membership.commande_ids.filter(id=>apState.runs.some(run=>run.commande_id===id&&APtrace.completed(run)&&Number(run.quantite_imprimee)>(reserved.get(run.id)||0)));if(live.length>1&&APGrouping.check(live,apState.orders,apState.runs,reserved))membership=null;}
    if(membership&&displayedGroups.has(membership.id))continue;
    if(membership)displayedGroups.add(membership.id);
    const memberIds=membership?.commande_ids||[order.id];
    const orderNumbers=apState.orders.filter(row=>memberIds.includes(row.id)).map(row=>row.ap_numero).join(' + ');
    const spec = apProductSpec(order.type_produit);
    if (!spec) continue;
    const completed = apState.runs.filter(r => memberIds.includes(r.commande_id)&&APtrace.completed(r));
    if (!completed.length) continue;
    const totalProduced = completed.reduce((s, r) => s + Number(r.quantite_imprimee || 0), 0);
    const totalShipped = completed.reduce((s, r) => s + shippedForRun(r.id), 0);
    const availableIds = Math.max(0, totalProduced - totalShipped);
    if (availableIds <= 0) continue;

    const groups=new Map();
    for(const run of completed) {
      const remaining=Math.max(0,Number(run.quantite_imprimee)-shippedForRun(run.id));
      if(!remaining) continue;
      const key=JSON.stringify(apPackingSettings(run,spec));
      if(!groups.has(key)) groups.set(key,{run,quantity:0});
      groups.get(key).quantity+=remaining;
    }
    const cartons=[...groups.values()].flatMap(group=>apCartons(group.quantity,spec,{...group.run,regroupement_h2:membership?false:order.regroupement_h2}));
    const totalCartons = cartons.reduce((s, c) => s + c.count, 0);
    const totalGrossKg = cartons.reduce((s, c) => s + (c.grossKg ? c.grossKg * c.count : 0), 0);
    const packetsCount = APcalc.packing(availableIds).packages;

    stockHtml.push('<div class="panel-soft p-4 flex flex-wrap items-center justify-between gap-3">' +
      '<div class="space-y-1">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="font-mono-code font-bold text-amber-500">' + esc(orderNumbers || 'APN') + '</span>' +
          '<b>' + esc(order.client) + '</b>' +
          '<span class="text-xs" style="color:var(--text-muted)">' + esc(spec.label) + ' · Réf. ' + esc(spec.reference) + '</span>' +
        '</div>' +
        '<div class="text-xs">En stock disponible : <b class="text-emerald-500">' + fmt(availableIds) + ' ID</b> (' + fmt(packetsCount) + ' paquet(s)) · ' +
        'Colisage : <b class="text-amber-400">' + fmt(totalCartons) + ' carton(s)</b>' +
        (totalGrossKg ? ' · ≈ ' + totalGrossKg.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' kg' : '') + '</div>' +
      '</div>' +
      '<div class="flex flex-wrap gap-2">' +
        '<a class="btn btn-secondary" href="colisage.html?commande-ap=' + encodeURIComponent(order.id) + '"><i class="fa-solid fa-boxes-packing"></i>Détail colisage</a>' +
        '<button type="button" class="btn btn-primary op-only" data-ap-action="ship-order" data-id="' + esc(order.id) + '"><i class="fa-solid fa-truck-fast"></i>Envoyer</button>' +
      '</div>' +
    '</div>');
  }
  $('#apStockList').innerHTML = stockHtml.join('') || '<p class="text-xs" style="color:var(--text-muted)">Aucun paquet en stock disponible pour le moment.</p>';
}

function setupInlineProductionForm() {
  const orderId = $('#apPrintOrder').value;
  const workspace = $('#apProdWorkspace');
  const station=apState.station||'';
  $('#apChooseStation').hidden=!!station;
  if(!station) { workspace.classList.add('hidden'); return; }
  const order = apState.orders.find(o => o.id === orderId);
  if (!order || !apProductSpec(order.type_produit)) {
    workspace.classList.add('hidden');
    return;
  }
  const available = remainingForPrint(order);
  if (available <= 0) {
    workspace.classList.add('hidden');
    return;
  }
  workspace.classList.remove('hidden');
  const busy = new Set(apState.runs.filter(run=>run.statut==='EN_COURS').map(run=>run.imprimante));
  const printers=workstationPrinters().filter(name=>!busy.has(name));
  $('#apProdOperator').textContent=apState.username||'—';
  $('#apProdRemaining').textContent=fmt(available)+' ID';
  $('#apAvailablePrinters').innerHTML=printers.map(name=>'<option value="'+esc(name)+'"></option>').join('');
  const wrap = $('#apPrintRows');
  const autoStartId = nextStartIdForOrder(order.id);
  const rowMarkup = (index, first, suggestedPrinter = '') => '<tr class="ap-print-row" data-row="' + index + '">' +
    '<td><input class="inp ap-first font-mono-code" inputmode="numeric" maxlength="16" placeholder="09 000 001" value="' + esc(first) + '" ' + (index === 0 ? 'required' : 'readonly') + '></td>' +
    '<td><input class="inp ap-last font-mono-code" readonly></td>' +
    '<td><input class="inp ap-seq-start" type="number" readonly></td>' +
    '<td><input class="inp ap-seq-end" type="number" readonly></td>' +
    '<td><input class="inp input-uppercase ap-printer" list="apAvailablePrinters" required maxlength="160" placeholder="IMP1" value="' + esc(suggestedPrinter) + '"></td>' +
    '<td class="ap-row-actions"><button type="button" class="ap-add-row" title="Démarrer cette impression" aria-label="Démarrer cette impression"><i class="fa-solid fa-plus"></i></button></td></tr>';

  if (wrap.dataset.orderId !== order.id || !wrap.children.length) {
    wrap.dataset.orderId = order.id;
    wrap.innerHTML = rowMarkup(0, autoStartId, printers[0] || '');
  } else {
    // Si la 1re ligne a encore l'ancien ID ou est vide alors qu'une suite existe, on met à jour automatiquement avec la suite
    const firstInput = wrap.querySelector('.ap-first');
    if (firstInput && autoStartId && !firstInput.dataset.manual) {
      firstInput.value = autoStartId;
    }
  }
  updateInlineRows();
}

function updateInlineRows() {
  const order = apState.orders.find(o => o.id === $('#apPrintOrder').value);
  if (!order) return;
  const available = remainingForPrint(order);
  const baseOrdinal = alreadyPlannedForOrder(order.id) + 1;
  const wrap = $('#apPrintRows');
  let next = '', offset = 0;
  const rows = [...wrap.querySelectorAll('.ap-print-row')];
  rows.forEach((row, i) => {
    const first = row.querySelector('.ap-first'), last = row.querySelector('.ap-last');
    const seqStart = row.querySelector('.ap-seq-start'), seqEnd = row.querySelector('.ap-seq-end');
    const qty = Math.min(1000, Math.max(1, available - offset));
    if (i > 0) first.value = next;
    const actualQty = Math.min(qty, available - offset);
    last.value = first.value ? APcalc.lastId(first.value, actualQty) : '';
    seqStart.value = baseOrdinal + offset;
    seqEnd.value = baseOrdinal + offset + actualQty - 1;
    next = last.value ? APcalc.lastId(last.value, 2) : '';
    offset += actualQty;
    const add = row.querySelector('.ap-add-row');
    add.hidden = i !== rows.length - 1;
    add.disabled = i !== rows.length - 1 || actualQty < 1 || !last.value;
  });
}

async function saveInlineProduction(button) {
  if(!workstationPrinters().length) return message('Choisissez un poste avec une imprimante en service.',true);
  if ($("#apProdSaveBtn").disabled) return;
  const order = apState.orders.find(o => o.id === $('#apPrintOrder').value);
  if (!order) return message('Choisissez une commande.', true);
  const available = remainingForPrint(order);
  const busy = new Set(apState.runs.filter(run => run.statut === 'EN_COURS').map(run => run.imprimante));
  const rows = [...$$('#apPrintRows .ap-print-row')];
  const prodDate = $('#apProdDate').value || logitrakToday();
  let total = 0; const payloads = []; const used = new Set();

  for (const row of rows) {
    const printer = row.querySelector('.ap-printer').value.trim().toUpperCase();
    const qty = Number(row.querySelector('.ap-seq-end').value) - Number(row.querySelector('.ap-seq-start').value) + 1;
    const first = row.querySelector('.ap-first').value.trim();
    const last = row.querySelector('.ap-last').value.trim();
    if (!printer || !first || !last) return message('Complétez la machine et le 1er ID (8 chiffres) de chaque ligne.', true);
    if (!workstationPrinters().includes(printer)) return message('Choisissez une imprimante disponible sur ce poste.',true);
    if (used.has(printer) || busy.has(printer)) return message('Une machine ne peut pas avoir deux tirages en cours simultanément : ' + printer, true);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 1000) return message('Chaque paquet doit contenir entre 1 et 1 000 ID.', true);
    const err = APcalc.rangeError(first, last, qty);
    if (err) return message(err, true);
    used.add(printer); total += qty;
    payloads.push({
      commande_id: order.id,
      statut: 'EN_COURS',
      quantite_prevue: qty,
      quantite_imprimee: 0,
      imprimante: printer,
      poste_travail: apState.station,
      numero_debut: first,
      numero_fin: last,
      date_production: prodDate,
    });
  }
  if (total > available) return message('La somme dépasse le reste de la commande (' + fmt(available) + ' ID).', true);

  if(order.created_by && order.created_by!==apState.username && !window.confirm('Cette commande a été saisie par '+order.created_by+'. Démarrer et prévenir cet opérateur ?')) return;
  const save = $('#apProdSaveBtn');
  if (button !== save) save.disabled = true;
  try { await withButton(button, async () => {
    for (const payload of payloads) await saveRecord('ap_productions', payload, null);
    $('#apPrintRows').innerHTML = '';
    delete $('#apPrintRows').dataset.orderId;
    await loadAP();
    message('Impression enregistrée dans les machines en cours.');
  }); } finally { save.disabled = false; }
}

/* ==================== 3. HISTORIQUE SIMPLE PAR PAQUET ==================== */
function expandRunToPackets(run, order, base) {
  const qty = Number(APtrace.completed(run) ? run.quantite_imprimee : run.quantite_prevue) || 0;
  if (qty <= 0) return [];
  const rawStart = String(run.numero_debut || '').replace(/\s/g, '');
  const isNum = /^\d+$/.test(rawStart);
  const padLen = rawStart.length || 8;
  const fmtId = n => {
    const s = String(n).padStart(padLen, '0');
    return s.length === 8 ? s.replace(/^(\d{2})(\d{3})(\d{3})$/, '$1 $2 $3') : s;
  };
  const packets = [];
  let offset = 0;
  while (offset < qty) {
    const count = Math.min(1000, qty - offset);
    const from = isNum ? fmtId(BigInt(rawStart) + BigInt(offset)) : (offset === 0 ? run.numero_debut : '—');
    const to = isNum ? fmtId(BigInt(rawStart) + BigInt(offset + count - 1)) : run.numero_fin;
    packets.push({
      date: run.date_production, orderId:run.commande_id, finishedAt:run.termine_at,
      ap_numero: order?.ap_numero || 'APN',
      client: order?.client || '—',
      from,
      to,
      count, ordinalStart:base+offset+1, ordinalEnd:base+offset+count,
      machine: run.imprimante || 'Non renseignée',
      operator: run.termine_par || run.created_by || 'Non renseigné',
      created_at: run.created_at, runId:run.id,
    });
    offset += count;
  }
  return packets;
}

function renderSimpleHistory() {
  const byOrder = new Map(apState.orders.map(o => [o.id, o]));
  const search = ($('#apTraceSearch').value || '').trim().toLowerCase();
  const idQuery = ($('#apTraceId').value || '').replace(/\s/g, '');
  const machineFilter = $('#apTraceMachine').value;

  const offsets=new Map(), totals=new Map();
  for(const run of [...apState.runs].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))) {
    const base=totals.get(run.commande_id)||0;
    offsets.set(run.id,base);
    totals.set(run.commande_id,base+Number(run.statut==='EN_COURS'?run.quantite_prevue:run.quantite_imprimee));
  }
  const ordinal=value=>String(value).padStart(4,'0');
  const allPackets = apState.runs
    .filter(run => APtrace.completed(run)&&(apState.admin||run.created_by===apState.username))
    .slice()
    .sort((a, b) => b.date_production.localeCompare(a.date_production) || b.created_at.localeCompare(a.created_at))
    .flatMap(run => expandRunToPackets(run, byOrder.get(run.commande_id), offsets.get(run.id)));

  const filtered = allPackets.filter(pkt => {
    if (machineFilter && pkt.machine !== machineFilter) return false;
    if (idQuery) {
      const f = pkt.from.replace(/\s/g, ''), t = pkt.to.replace(/\s/g, '');
      if (/^\d+$/.test(idQuery) && /^\d+$/.test(f) && /^\d+$/.test(t)) {
        if (BigInt(idQuery) < BigInt(f) || BigInt(idQuery) > BigInt(t)) return false;
      } else if (!f.includes(idQuery) && !t.includes(idQuery)) return false;
    }
    if (search && ![pkt.date, pkt.ap_numero, pkt.client, pkt.from, pkt.to, pkt.machine, pkt.operator].join(' ').toLowerCase().includes(search)) return false;
    return true;
  });

  $('#apTraceCount').textContent = fmt(filtered.length) + ' paquet(s)';
  const groups=new Map();
  for(const packet of filtered) {
    const key=packet.date+'|'+packet.orderId;
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(packet);
  }
  const clock=new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Algiers',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  $('#apTraceRows').innerHTML = [...groups.values()].map(packets=>{
    const first=packets[0];
    const segments=[];
    for(const packet of [...packets].sort((a,b)=>a.ordinalStart-b.ordinalStart)) {
      const from=packet.from.replace(/\s/g,''),to=packet.to.replace(/\s/g,'');
      const previous=segments.at(-1);
      if(previous&&/^\d+$/.test(from)&&/^\d+$/.test(previous.end)&&BigInt(previous.end)+1n===BigInt(from)) {
        previous.end=to; previous.last=packet.to;
      } else segments.push({start:from,end:to,first:packet.from,last:packet.to});
    }
    const range=segments.map(segment=>'<span class="whitespace-nowrap"><span class="ap-range-word">De</span> '+esc(segment.first)+' <span class="ap-range-word">à</span> '+esc(segment.last)+'</span>').join(' · ');
    const key=first.date+'|'+first.orderId;
    const expanded=[...$('#apTraceRows').querySelectorAll('details[open]')].some(detail=>detail.dataset.historyGroup===key);
    return '<tr><td colspan="6" class="p-2"><details data-history-group="'+esc(key)+'"'+(expanded?' open':'')+'>'+
      '<summary class="cursor-pointer p-3 font-semibold" style="background:var(--bg-input);border-radius:8px"><span>'+esc(first.date)+' · '+esc(first.ap_numero)+' · '+esc(first.client)+'</span> · '+range+'</summary>'+
      '<div class="overflow-x-auto mt-2"><table class="w-full text-xs text-left"><thead><tr>'+
      ['Plage','Nombre','Heure de fin','Statut','Machine','Opérateur'].map(label=>'<th class="p-3">'+label+'</th>').join('')+
      '</tr></thead><tbody>'+
      packets.sort((a,b)=>a.ordinalStart-b.ordinalStart).map(pkt=>'<tr class="border-b" style="border-color:var(--border)">'+ 
      '<td class="p-3 whitespace-nowrap font-mono-code"><span class="ap-range-word">De</span> ' + esc(pkt.from) + ' <span class="ap-range-word">à</span> ' + esc(pkt.to) + '</td>' +
      '<td class="p-3 whitespace-nowrap font-mono-code"><span class="ap-range-word">De</span> ' + ordinal(pkt.ordinalStart) + ' <span class="ap-range-word">à</span> ' + ordinal(pkt.ordinalEnd) + '</td>' +
      '<td class="p-3 whitespace-nowrap">' + (pkt.finishedAt?clock.format(new Date(pkt.finishedAt)):'—') + '</td>' +
      '<td class="p-3 font-bold ap-operator">OK</td><td class="p-3 font-semibold ap-machine">' + esc(pkt.machine) + '</td>' +
      '<td class="p-3 font-semibold ap-operator">' + esc(pkt.operator) + (apState.admin?' <button type="button" class="underline" data-delete-run="'+esc(pkt.runId)+'">Supprimer le tirage</button>':'') + '</td>' +
    '</tr>'
    ).join('')+'</tbody></table></div></details></td></tr>';
  }).join('') || '<tr><td colspan="6" class="p-6 text-center" style="color:var(--text-muted)">Aucun paquet produit correspondant.</td></tr>';
}

/* ==================== ACTIONS & SUPABASE ==================== */
async function saveRecord(table, payload, previous) {
  let query = previous ? sb.from(table).update(payload).eq('id', previous.id).eq('revision', previous.revision) : sb.from(table).insert(payload);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('La fiche a changé ou son délai de modification est dépassé. Actualisez les données.');
  return data.id;
}
async function withButton(button, action) {
  button.disabled = true;
  try { await action(); }
  catch (error) { console.warn(error); message(error.message || 'Opération impossible.', true); }
  finally { button.disabled = false; }
}
async function saveOrder(event) {
  event.preventDefault();
  await withButton($('#apOrderSave'), async () => {
    if(!apState.orderEdit&&!apState.admin){
      const [orders,runs]=await Promise.all([readLogiTrakRows(sb,'ap_commandes'),readLogiTrakRows(sb,'ap_productions')]);
      apState.orders=orders;apState.runs=runs;
      renderOrderPrerequisites();
      const reasons=newOrderPrerequisites();
      if(reasons.length){$('#apOrderPrerequisites')?.scrollIntoView({behavior:'smooth',block:'center'});throw new Error(reasons.join('\n'));}
    }
    if(apState.orderEdit&&!canEditOrder(apState.orderEdit))throw new Error('Seul le créateur ou un administrateur peut modifier cette commande.');
    const spec = apProductSpec($('#apSubtype').value);
    if (!spec) throw new Error('Choisissez un type de produit.');
    const payload = {
      client: $('#apClient').value.trim().toUpperCase(), categorie: $('#apCategory').value,
      type_produit: $('#apSubtype').value, sous_categorie: spec.label, quantite_demandee: Number($('#apQty').value),
      date_commande: $('#apOrderDate').value, observations: $('#apOrderNotes').value.trim(),
    };
    if (!payload.client || !payload.sous_categorie || !Number.isSafeInteger(payload.quantite_demandee) || payload.quantite_demandee < 1)
      throw new Error('Renseignez le client, le produit et une quantité entière positive.');
    if(apState.orderEdit){const planned=orderRuns(apState.orderEdit.id).reduce((sum,run)=>sum+Number(run.statut==='EN_COURS'?run.quantite_prevue:run.quantite_imprimee||0),0);if(payload.quantite_demandee<planned)throw new Error('La commande compte déjà '+fmt(planned)+' ID produits ou en cours : la quantité corrigée ne peut pas être inférieure.');}
    // APN attribué par la base et immuable, y compris pour un administrateur.
    const creating=!apState.orderEdit;
    const id=await saveRecord('ap_commandes',payload,apState.orderEdit);
    resetOrder();
    await loadAP();
    if(creating) openProductionOrder(id);
    message('Commande enregistrée.');
  });
}
function editOrder(order) {
  if (!canEditOrder(order)) return message('Seul le créateur de la commande ou un administrateur peut la modifier.', true);
  apState.orderEdit = order;
  if ($('#apOrderEditor')) $('#apOrderEditor').open = true;
  renderOrderPrerequisites();
  $('#apNumberField').hidden=true;
  $('#apNumber').value=order.ap_numero||'';
  for (const [id, key] of Object.entries({ apClient: 'client', apCategory: 'categorie', apQty: 'quantite_demandee', apOrderDate: 'date_commande', apOrderNotes: 'observations' }))
    $('#' + id).value = order[key];
  fillSubtypes(order.type_produit || '');
  $('#apOrderTitle').textContent = 'Modifier la commande UPW';
  $('#apOrderCancel').classList.remove('hidden');
  $('#apClient').focus();
}
async function deleteOrder(order, button) {
  if (!apState.admin) return message('La suppression des commandes est réservée à l’administrateur.', true);
  const runs = orderRuns(order.id);
  if (runs.some(run => apState.shipments.some(line => line.ap_production_id === run.id))) {
    return message('Cette commande est liée à un envoi. Retirez ses tirages de l’envoi avant de la supprimer.', true);
  }
  if (!window.confirm(runs.length ? 'Supprimer cette commande et ses paquets ?' : 'Supprimer cette commande ?')) return;
  await withButton(button, async () => {
    const { data, error } = await sb.from('ap_commandes').delete().eq('id', order.id).eq('revision', order.revision).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('La commande a changé ou le délai est dépassé.');
    if (apState.orderEdit?.id === order.id) resetOrder();
    await loadAP(); message('Commande supprimée.');
  });
}
async function validateAPPrint(run, button) {
  if(apNow()<printUnlockTime(run)) return message('Attendez la fin du compte à rebours avant de valider.',true);
  if (!canEdit(run)) return;
  await withButton(button, async () => {
    await saveRecord('ap_productions', { statut: 'TERMINE', quantite_imprimee: run.quantite_prevue }, run);
    $('#apPrintRows').innerHTML = '';
    delete $('#apPrintRows').dataset.orderId;
    await loadAP();
    message('Paquet validé et mis en stock.');
  });
}

// Valide la plage actuelle d'une machine (ex: IMP2) et démarre immédiatement la plage suivante sur cette même machine sans saisie manuelle
async function validateAndContinueAPPrint(run, button) {
  if(apNow()<printUnlockTime(run)) return message('Attendez la fin du compte à rebours avant de valider.',true);
  if(!workstationPrinters().includes(run.imprimante)) return message('Choisissez le poste associé à cette imprimante pour lancer la suite.',true);
  if (!canEdit(run)) return;
  if (!window.confirm('Confirmez-vous que l’impression sur '+run.imprimante+' de '+run.numero_debut+' à '+run.numero_fin+' est terminée ? Le paquet sera mis en stock.')) return;
  const order = apState.orders.find(o => o.id === run.commande_id);
  if (!order) return;
  const rem = remainingForPrint(order);
  const nextStart = nextStartIdForOrder(order.id);
  const nextQty = Math.min(1000, rem);
  const nextEnd = nextStart && nextQty > 0 ? APcalc.lastId(nextStart, nextQty) : '';

  await withButton(button, async () => {
    // 1. Valider la plage qui vient de se terminer sur la machine
    await saveRecord('ap_productions', { statut: 'TERMINE', quantite_imprimee: run.quantite_prevue }, run);
    // 2. Si la commande a encore des ID à produire, lancer directement la nouvelle plage sur la même machine
    if (nextStart && nextEnd && nextQty > 0) {
      try { await saveRecord('ap_productions', {
        commande_id: order.id,
        statut: 'EN_COURS',
        quantite_prevue: nextQty,
        quantite_imprimee: 0,
        imprimante: run.imprimante,
        poste_travail: run.poste_travail || (/^IMP0[56]$/.test(run.imprimante)?'Poste02':'Poste01'),
        numero_debut: nextStart,
        numero_fin: nextEnd,
        date_production: logitrakToday(),
      }, null); } catch (error) {
        await loadAP();
        throw new Error('Paquet mis en stock. La plage suivante n’a pas été lancée. '+error.message);
      }
      $('#apPrintRows').innerHTML = '';
      delete $('#apPrintRows').dataset.orderId;
      await loadAP();
      message('Paquet ' + run.numero_debut + ' → ' + run.numero_fin + ' validé · Nouvelle impression ' + nextStart + ' → ' + nextEnd + ' lancée sur ' + run.imprimante + '.');
    } else {
      $('#apPrintRows').innerHTML = '';
      delete $('#apPrintRows').dataset.orderId;
      await loadAP();
      message('Paquet validé et mis en stock (commande complète).');
    }
  });
}

function shipAPOrder(order) {
  location.assign('envois.html?new=1&commande-ap=' + encodeURIComponent(order.id));
}
function openProductionOrder(id) {
  switchAPTab('production');
  $('#apPrintOrder').value=id;
  $('#apPrintRows').replaceChildren();
  delete $('#apPrintRows').dataset.orderId;
  setupInlineProductionForm();
  if(!document.body.classList.contains('is-operator')) return;
  if(!$('#apWorkstation').value) $('#apWorkstation').focus();
  else $('#apPrintRows .ap-first')?.focus();
}
function handleAction(event) {
  const button = event.target.closest('[data-ap-action]');
  if (!button) return;
  const act = button.dataset.apAction;
  if (act === 'validate-run') {
    const run = apState.runs.find(row => row.id === button.dataset.id);
    if (run) validateAPPrint(run, button);
    return;
  }
  if (act === 'validate-and-continue') {
    const run = apState.runs.find(row => row.id === button.dataset.id);
    if (run) validateAndContinueAPPrint(run, button);
    return;
  }
  const order = apState.orders.find(row => row.id === button.dataset.id);
  if (!order) return;
  if (act === 'goto-prod') return openProductionOrder(order.id);
  if (act === 'ship-order') return shipAPOrder(order);
  if(act==='permit-order'&&apState.admin) return withButton(button,async()=>{
    await saveRecord('ap_commandes',{autorise_nouvelle_commande:!order.autorise_nouvelle_commande},order);
    await loadAP();
  });
  if (act === 'delete-order') return deleteOrder(order, button);
  if (act === 'edit-order') return editOrder(order);
}

function showGate(html) { $('#gate').innerHTML = html; $('#gate').classList.remove('hidden'); $('#apApp').classList.add('hidden'); }
function loginGate() {
  showGate('<h3 class="font-bold">Connexion opérateur</h3><form onsubmit="doLogin(event)" class="space-y-3">' +
    '<input id="loginUsername" class="inp" required placeholder="Identifiant" autocomplete="username">' +
    '<input id="loginPassword" type="password" class="inp" required placeholder="Mot de passe" autocomplete="current-password">' +
    '<p id="loginMsg" class="text-xs text-rose-400" role="status"></p><button type="submit" class="btn btn-primary">Se connecter</button></form>');
}
async function doLogin(event) {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true;
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: $('#loginUsername').value.trim().toLowerCase() + '@logitrak.internal', password: $('#loginPassword').value });
    if (error || !data?.session) { $('#loginMsg').textContent = 'Identifiant ou mot de passe incorrect.'; return; }
    window.location.assign('index.html');
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; }
}
async function start() {
  try {
    let session = typeof getLogiTrakSession === 'function' ? getLogiTrakSession() : null;
    if (!session && sb) {
      const res = await Promise.race([
        sb.auth.getSession().catch(() => ({ data: { session: null } })),
        new Promise(r => setTimeout(() => r({ data: { session: null } }), 400))
      ]);
      session = res?.data?.session;
    }
    const username = (session?.user?.email?.split('@')[0] || '').toLowerCase();
    apState.username = username || '';
    if (!username) { loginGate(); return; }
    const { data, error } = await sb.from('operateurs').select('role').eq('username', username).maybeSingle();
    if (error) throw error;
    apState.admin = data?.role === 'admin';
    apState.viewer = data?.role === 'visionnaire';
    document.body.classList.toggle('is-admin', apState.admin);
    document.body.classList.toggle('is-operator', !!data && !apState.viewer);
    if (!data) { showGate('<p>Compte opérateur requis.</p>'); return; }
    await loadAP();
    resetOrder();
    $('#gate').classList.add('hidden');
    $('#apApp').classList.remove('hidden');
  } catch (error) {
    showGate('<h3 class="font-bold">Module indisponible</h3><p class="text-sm">' + esc(error.message || 'Erreur de chargement') + '</p>');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  syncThemeIcon();
  $('#apTraceRows').onclick=event=>{
    const button=event.target.closest('[data-delete-run]');
    if(!button||!apState.admin||!confirm('Supprimer ce tirage de la production et de l’historique ?')) return;
    withButton(button,async()=>{
      const {error}=await sb.from('ap_productions').delete().eq('id',button.dataset.deleteRun);
      if(error) throw error;
      await loadAP();
    });
  };
  $('#apWorkstation').onchange=event=>changeStation(event.target.value,false);
  $('#apReleaseStation').onclick=()=>changeStation(apState.station,true);
  setInterval(updatePrintCountdowns,1000);
  setInterval(()=>{ updatePrintingWarning(); if(apState.username) loadAPNotices().catch(console.warn); },30000);
  $$('[data-ap-tab]').forEach(btn => btn.addEventListener('click', () => switchAPTab(btn.dataset.apTab)));
  $('#apOrderForm').addEventListener('submit', saveOrder);
  $('#apOrderCancel').addEventListener('click', resetOrder);
  $('#apCategory').addEventListener('change', () => { $('#apSubtype').value = ''; fillSubtypes(); });
  $('#apSearch').addEventListener('input', renderOrders);
  $('#apFilter').addEventListener('change', renderOrders);
  $('#apOrdersList').addEventListener('click', handleAction);
  $('#apActive').addEventListener('click', handleAction);
  $('#apStockList').addEventListener('click', handleAction);

  $('#apPrintOrder').addEventListener('change', () => {
    $('#apPrintRows').innerHTML = '';
    delete $('#apPrintRows').dataset.orderId;
    setupInlineProductionForm();
  });
  $('#apPrintRows').addEventListener('input', e => {
    if (e.target.matches('.ap-first')) {
      e.target.dataset.manual = '1';
      updateInlineRows();
    }
  });
  $('#apPrintRows').addEventListener('click', e => {
    const add = e.target.closest('.ap-add-row');
    if (add && !add.disabled) saveInlineProduction(add);
  });
  $('#apProdSaveBtn').addEventListener('click', event => saveInlineProduction(event.currentTarget));

  for (const id of ['apTraceId', 'apTraceSearch', 'apTraceMachine']) $('#' + id).addEventListener('input', renderSimpleHistory);
  $('#apReload').addEventListener('click', async e => {
    await withButton(e.currentTarget, async () => { await loadAP(); message('Données actualisées.'); });
  });

  const isAuth = (() => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        if (/^sb-.*-auth-token$/.test(localStorage.key(i))) {
          const v = JSON.parse(localStorage.getItem(localStorage.key(i)));
          return !!((v && v.user && v.user.email) || (v && v.currentSession && v.currentSession.user && v.currentSession.user.email));
        }
      }
    } catch (e) {}
    return false;
  })();
  if (!isAuth) return;

  const get = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const u = get('supabase_url') || SUPABASE_URL, k = get('supabase_key') || SUPABASE_ANON;
  sb = typeof getLogiTrakClient === 'function' ? getLogiTrakClient(u, k) : window.supabase.createClient(u, k);
  start();
});
