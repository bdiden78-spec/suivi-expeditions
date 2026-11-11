async function loadAPColisage() {
  const section=document.getElementById('apColisage');
  if (!state.isOperator || section.dataset.loaded) return;
  const select=document.getElementById('apPackingOrder');
  const output=document.getElementById('apPackingOutput');
  const button=document.getElementById('apPackingPrint');
  const params=new URLSearchParams(location.search);
  const requested=params.get('commande-ap');
  section.classList.remove('hidden');
  try {
    const [orders,runs]=await Promise.all([readLogiTrakRows(state.sb,'ap_commandes'),readLogiTrakRows(state.sb,'ap_productions')]);
    section.dataset.loaded='1';
    const editor=document.getElementById('apPackingEditor');
    const runSelect=editor.elements.run;
    const settingsBox=editor.querySelector('[data-packing-fields]');
    const save=editor.querySelector('button');
    const status=document.getElementById('apPackingStatus');
    settingsBox.innerHTML=apPackingFields();
    const editable=run=>state.isAdmin||Date.now()-Date.parse(run.created_at)<48*3600000;
    function selectedRun() {
      return runs.find(run=>run.id===runSelect.value&&run.commande_id===select.value&&run.statut==='TERMINE');
    }
    runSelect.addEventListener('change',()=>{
      const run=selectedRun(),order=orders.find(row=>row.id===select.value);
      settingsBox.hidden=!run;
      save.hidden=!run;
      if(!run) return;
      fillAPPackingFields(editor.elements,run,apProductSpec(order.type_produit));
    });
    editor.addEventListener('submit',async event=>{
      event.preventDefault();
      const run=selectedRun();
      if(!run||!editable(run)) return;
      save.disabled=true;
      try {
        const {data,error}=await state.sb.from('ap_productions').update(readAPPackingFields(editor.elements))
          .eq('id',run.id).eq('revision',run.revision).select('*').maybeSingle();
        if(error) throw error;
        if(!data) throw new Error('Tirage modifié ou délai de 48 h dépassé. Actualisez la page.');
        Object.assign(run,data);
        render();
        status.textContent='Colisage enregistré.';
      } catch(error) { status.textContent=error.message; }
      finally { save.disabled=false; }
    });
    select.innerHTML='<option value="">Choisir une commande</option>'+orders.map(order=>
      '<option value="'+esc(order.id)+'">'+esc(order.client+' · '+order.sous_categorie+' · '+order.date_commande)+'</option>').join('');
    function render() {
      const order=orders.find(row=>row.id===select.value);
      const spec=apProductSpec(order?.type_produit);
      button.disabled=true;
      editor.hidden=true;
      status.textContent='';
      if(!order||!spec) {
        output.textContent=order?'Renseignez le type de produit dans la commande Algérie Poste.':'Choisissez une commande Algérie Poste.';
        return;
      }
      const completed=runs.filter(run=>run.commande_id===order.id&&run.statut==='TERMINE');
      const editableRuns=completed.filter(editable);
      editor.hidden=!editableRuns.length;
      runSelect.innerHTML='<option value="">Choisir un tirage à modifier</option>'+editableRuns.map(run=>
        '<option value="'+esc(run.id)+'">'+esc(run.numero_debut+' → '+run.numero_fin+' · '+(run.imprimante||'Imprimante inconnue'))+'</option>').join('');
      settingsBox.hidden=true;
      save.hidden=true;
      const kg=value=>Number(value).toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:3});
      const rows=completed.flatMap(run=>apCartons(run.quantite_imprimee,spec,run).map(group=>
        '<tr><td>'+esc(run.imprimante||'Non renseignée')+'<br>'+esc(run.numero_debut)+' → '+esc(run.numero_fin)+'</td>'+
        '<td>'+fmtNum(group.count)+' × '+esc(group.carton)+'</td><td>'+fmtNum(group.ids)+' ID<br>'+esc(group.packing)+'<br>'+fmtNum(group.capacity)+' paquets par carton · '+kg(group.packetKg)+' kg par paquet complet'+'</td>'+
        '<td>'+kg(group.netKg)+' kg</td><td>'+(group.grossKg===null?'Tare non renseignée':kg(group.grossKg)+' kg')+'</td></tr>')).join('');
      output.innerHTML='<p><b>'+esc(order.client)+'</b> · '+esc(spec.label)+' · '+spec.copies+' exemplaires</p>'+
        '<p>Référence '+spec.reference+' · Gabarit '+spec.format+' · '+esc(spec.colors)+'</p>'+
        (rows?'<div class="overflow-x-auto"><table class="ap-packing-table w-full text-xs"><thead><tr><th>Imprimante / plage du tirage</th><th>Cartons</th><th>Contenu par carton</th><th>Net par carton</th><th>Brut estimé par carton</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p>Aucun tirage validé.</p>')+
        '<p class="text-xs">Le poids du paquet incomplet est estimé au prorata. Le poids brut inclut la tare du carton lorsqu’elle est renseignée.</p>';
      button.disabled=!rows;
    }
    select.addEventListener('change',render);
    if(orders.some(order=>order.id===requested)) select.value=requested;
    render();
    if(requested) section.scrollIntoView({block:'start'});
    button.addEventListener('click',async()=>{
      const sheet=document.getElementById('apPackingSheet');
      sheet.innerHTML='<div class="print-brand"><img src="assets/logitrak-eurequat.jpg" alt="LogiTrak" width="2752" height="1536"></div><h1>Colisage Algérie Poste</h1>'+output.innerHTML;
      document.body.classList.add('ap-printing');
      try { await printLogiTrakDocument(sheet); }
      finally { document.body.classList.remove('ap-printing'); }
    });
  } catch(error) { output.textContent=error.message||'Colisage Algérie Poste indisponible.'; }
}
