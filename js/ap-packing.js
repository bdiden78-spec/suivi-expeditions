async function loadAPColisage() {
  const section=document.getElementById('apColisage');
  if (!(state.isOperator || state.isViewer) || section.dataset.loaded) return;
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
    const editable=run=>state.isOperator&&(state.isAdmin||Date.now()-Date.parse(run.created_at)<24*3600000);
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
        if(!data) throw new Error('Tirage modifié ou délai de 24 h dépassé. Actualisez la page.');
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
      // Regrouper les paquets au niveau de la commande, jamais par imprimante/opérateur.
      // Chaque tranche validée de 1 000 ID alimente le même flux de colisage.
      const packetRows=[];
      for (const run of [...completed].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))) {
        const qty=Number(run.quantite_imprimee||0);
        const first=String(run.numero_debut||'').replace(/\s/g,'');
        const numeric=/^\d+$/.test(first);
        let offset=0, packetNo=1;
        while(offset<qty) {
          const count=Math.min(1000,qty-offset);
          const from=numeric?String(BigInt(first)+BigInt(offset)):'';
          const to=numeric?String(BigInt(first)+BigInt(offset+count-1)):'';
          packetRows.push({count,from,to,printer:run.imprimante||'Non renseignée',operator:run.created_by||'Non renseigné',settings:apPackingSettings(run,spec),packetNo:packetNo++});
          offset+=count;
        }
      }
      const groups=new Map();
      for(const packet of packetRows) {
        const key=JSON.stringify(packet.settings);
        if(!groups.has(key)) groups.set(key,[]);
        groups.get(key).push(packet);
      }
      const cartonRows=[];
      let canMerge=false;
      for(const group of groups.values()) {
        const {carton,capacity,packetKg}=group[0].settings;
        const mergeable=carton==='H1'&&group.length>capacity&&group.length%capacity!==0;
        canMerge ||= mergeable;
        const merge=mergeable&&order.regroupement_h2;
        const boundary=merge?Math.floor(group.length/capacity)*capacity-capacity:group.length;
        for(let i=0;i<group.length;i+=capacity) {
          const combined=merge&&i===boundary;
          const cartonType=combined?'H2':carton;
          const packets=group.slice(i,combined?group.length:i+capacity);
          const tare=LTColis.TARE[cartonType];
        const ids=packets.reduce((sum,packet)=>sum+packet.count,0);
        const net=ids/1000*packetKg;
        cartonRows.push('<tr><td>'+cartonType+' · '+(cartonRows.length+1)+'</td><td>'+packets.length+(combined?'':' / '+capacity)+' paquets</td><td>'+fmtNum(ids)+' ID</td><td>'+kg(net)+' kg</td><td>'+(typeof tare==='number'?kg(net+tare)+' kg':'Tare non renseignée')+'</td><td>'+packets.map((packet,index)=>'<div class="mb-1">P'+(i+index+1)+' · '+(packet.from?esc(packet.from.replace(/(\d{2})(\d{3})(\d{3})/,'$1 $2 $3'))+' → '+esc(packet.to.replace(/(\d{2})(\d{3})(\d{3})/,'$1 $2 $3')):'Plage non renseignée')+' · '+esc(packet.printer)+' · '+esc(packet.operator)+'</div>').join('')+'</td></tr>');
        if(combined) break;
      }
      }
      const rows=cartonRows.join('');
      output.innerHTML='<p><b>'+esc(order.client)+'</b> · '+esc(spec.label)+' · '+spec.copies+' exemplaires</p>'+
        '<p>Référence '+spec.reference+' · Gabarit '+spec.format+' · '+esc(spec.colors)+'</p>'+
        (rows?'<div class="overflow-x-auto"><table class="ap-packing-table w-full text-xs"><thead><tr><th>Carton</th><th>Remplissage</th><th>Contenu</th><th>Poids net</th><th>Poids brut estimé</th><th>Paquets (opérateur / imprimante / plage)</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p>Aucun tirage validé.</p>')+
        '<p class="text-xs">Les paquets validés sont regroupés par commande, même s’ils proviennent de plusieurs opérateurs ou imprimantes. Un carton ne mélange jamais deux commandes. H1 : '+spec.capacity/1000+' paquets. Choisissez H2 sur les tirages à placer en reliquat.</p>';
      if(canMerge&&(order.regroupement_h2||editable(order))) {
        const action=document.createElement('button');
        action.type='button';
        action.className='btn btn-secondary';
        action.textContent=order.regroupement_h2?'Rétablir le colisage H1':'Regrouper un H1 plein et le reliquat dans un H2';
        action.disabled=!editable(order);
        action.onclick=async()=>{
          if(!order.regroupement_h2&&!window.confirm('Confirmez que le H2 peut contenir les paquets du H1 plein et du reliquat.')) return;
          action.disabled=true;
          try {
            const {data,error}=await state.sb.from('ap_commandes').update({regroupement_h2:!order.regroupement_h2})
              .eq('id',order.id).eq('revision',order.revision).select('*').maybeSingle();
            if(error) throw error;
            if(!data) throw new Error('Commande modifiée ou délai de modification dépassé. Actualisez la page.');
            Object.assign(order,data);
            render();
            status.textContent='Colisage enregistré.';
          } catch(error){status.textContent=error.message;}
          finally {action.disabled=false;}
        };
        output.append(action);
      }
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
