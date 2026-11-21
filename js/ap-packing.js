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
    const [orders,runs,lines]=await Promise.all([readLogiTrakRows(state.sb,'ap_commandes'),readLogiTrakRows(state.sb,'ap_productions'),readLogiTrakRows(state.sb,'lignes_expedition','ap_production_id,quantite')]);
    let packingGroups=await APGrouping.load(state.sb);
    const reserved=new Map();
    for(const line of lines) if(line.ap_production_id) reserved.set(line.ap_production_id,(reserved.get(line.ap_production_id)||0)+Number(String(line.quantite||'').replace(/[^0-9]/g,'')||0));
    async function refreshSnapshot(){
      const [freshOrders,freshRuns,freshLines,freshGroups]=await Promise.all([readLogiTrakRows(state.sb,'ap_commandes'),readLogiTrakRows(state.sb,'ap_productions'),readLogiTrakRows(state.sb,'lignes_expedition','ap_production_id,quantite'),APGrouping.load(state.sb)]);
      orders.splice(0,orders.length,...freshOrders);runs.splice(0,runs.length,...freshRuns);packingGroups=freshGroups;reserved.clear();
      for(const line of freshLines)if(line.ap_production_id)reserved.set(line.ap_production_id,(reserved.get(line.ap_production_id)||0)+Number(String(line.quantite||'').replace(/[^0-9]/g,'')||0));
    }
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
      const membership=APGrouping.groupFor(order.id,packingGroups);
      const memberIds=membership?.commande_ids||[order.id];
      const memberOrders=orders.filter(row=>memberIds.includes(row.id));
      const completed=runs.filter(run=>memberIds.includes(run.commande_id)&&run.statut==='TERMINE'&&Number(run.quantite_imprimee)>(reserved.get(run.id)||0));
      const liveIds=memberIds.filter(id=>completed.some(run=>run.commande_id===id));
      const groupError=liveIds.length>1?APGrouping.check(liveIds,orders,runs,reserved):'';
      if(groupError){
        output.textContent='Regroupement à vérifier : '+groupError;
        if(state.isOperator){const split=document.createElement('button');split.type='button';split.className='btn btn-secondary no-print';split.textContent='Dissocier les fractions';split.onclick=async()=>{if(!confirm('Rétablir un colisage séparé ?'))return;split.disabled=true;try{const {error}=await state.sb.rpc('ap_dissocier_fractions',{p_groupe:membership.id});if(error)throw error;await refreshSnapshot();render();}catch(error){status.textContent=error.message;}finally{split.disabled=false;}};output.append(split);}
        return;
      }
      const editableRuns=completed.filter(run=>run.commande_id===order.id&&editable(run));
      editor.hidden=!editableRuns.length;
      runSelect.innerHTML='<option value="">Choisir un tirage à modifier</option>'+editableRuns.map(run=>
        '<option value="'+esc(run.id)+'">'+esc(run.numero_debut+' → '+run.numero_fin+' · '+(run.imprimante||'Imprimante inconnue'))+'</option>').join('');
      settingsBox.hidden=true;
      save.hidden=true;
      const kg=value=>Number(value).toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:3});
      // Regrouper les paquets au niveau de la commande, jamais par imprimante/opérateur.
      // Chaque tranche validée de 1 000 ID alimente le même flux de colisage.
      const formatID=value=>String(value).padStart(8,'0').replace(/^(\d{2})(\d{3})(\d{3})$/,'$1 $2 $3');
      const packetRows=[];
      for (const run of [...completed].sort((a,b)=>Number(APGrouping.number(a.numero_debut))-Number(APGrouping.number(b.numero_debut)))) {
        const used=reserved.get(run.id)||0;
        const qty=Math.max(0,Number(run.quantite_imprimee||0)-used);
        let first=String(run.numero_debut||'').replace(/\s/g,'');
        if(/^\d+$/.test(first)) first=String(BigInt(first)+BigInt(used));
        const numeric=/^\d+$/.test(first);
        let offset=0, packetNo=1;
        while(offset<qty) {
          const count=Math.min(1000,qty-offset);
          const from=numeric?String(BigInt(first)+BigInt(offset)):'';
          const to=numeric?String(BigInt(first)+BigInt(offset+count-1)):'';
          packetRows.push({count,from,to,printer:run.imprimante||'Non renseignée',operator:run.created_by||'Non renseigné',settings:apPackingSettings(run,spec),orderNumber:orders.find(row=>row.id===run.commande_id)?.ap_numero||'APN',packetNo:packetNo++});
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
        const merge=mergeable&&!membership&&order.regroupement_h2;
        const boundary=merge?Math.floor(group.length/capacity)*capacity-capacity:group.length;
        for(let i=0;i<group.length;i+=capacity) {
          const combined=merge&&i===boundary;
          const cartonType=combined?'H2':carton;
          const packets=group.slice(i,combined?group.length:i+capacity);
          const tare=LTColis.TARE[cartonType];
        const ids=packets.reduce((sum,packet)=>sum+packet.count,0);
        const net=ids/1000*packetKg;
        cartonRows.push('<tr><td>'+cartonType+' · '+(cartonRows.length+1)+'</td><td>'+packets.length+(combined?'':' / '+capacity)+' paquets</td><td>'+fmtNum(ids)+' ID</td><td>'+kg(net)+' kg</td><td>'+(typeof tare==='number'?kg(net+tare)+' kg':'Tare non renseignée')+'</td><td><table class="w-full"><thead><tr><th>Commande</th><th>Plage</th><th>Imprimante</th><th>Opérateur</th></tr></thead><tbody>'+packets.map(packet=>'<tr><td>'+esc(packet.orderNumber)+'</td><td class="font-mono-code">'+(packet.from?esc(formatID(packet.from)+' → '+formatID(packet.to)):'—')+'</td><td>'+esc(packet.printer)+'</td><td>'+esc(packet.operator)+'</td></tr>').join('')+'</tbody></table></td></tr>');
        if(combined) break;
      }
      }
      const rows=cartonRows.join('');
      output.innerHTML='<p><b>'+esc(memberOrders.map(row=>row.ap_numero).join(' + '))+'</b></p><p><b>'+esc(order.client)+'</b> · '+esc(spec.label)+' · '+spec.copies+' exemplaires</p>'+
        '<p>Référence '+spec.reference+' · Gabarit '+spec.format+' · '+esc(spec.colors)+'</p>'+
        (rows?'<div class="overflow-x-auto"><table class="ap-packing-table w-full text-xs"><thead><tr><th>Carton</th><th>Remplissage</th><th>Contenu</th><th>Poids net</th><th>Poids brut estimé</th><th>Détail des paquets</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p>Aucun tirage validé.</p>')+
        '<p class="text-xs no-print">Les paquets validés sont regroupés par commande, même s’ils proviennent de plusieurs opérateurs ou imprimantes. Deux fractions compatibles peuvent être regroupées volontairement en conservant leurs APN°. H1 : '+spec.capacity/1000+' paquets. Choisissez H2 sur les tirages à placer en reliquat.</p>';
      if(!membership&&canMerge&&(order.regroupement_h2||editable(order))) {
        const action=document.createElement('button');
        action.type='button';
        action.className='btn btn-secondary no-print';
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
      if(state.isOperator) {
        const grouping=document.createElement('div');grouping.className='panel-soft p-3 space-y-2 no-print';
        const candidates=orders.filter(candidate=>!memberIds.includes(candidate.id)).map(candidate=>({candidate,ids:[...new Set([...memberIds,...APGrouping.members(candidate.id,packingGroups)])]})).filter(entry=>!APGrouping.check(entry.ids,orders,runs,reserved));
        grouping.innerHTML='<p class="font-bold">Compléter les cartons avec une autre fraction</p><p class="text-xs">Même UPW, même catégorie et même produit, dates espacées de 7 jours maximum et plages continues. Le regroupement est volontaire.</p>';
        if(candidates.length){
          const picker=document.createElement('select');picker.className='inp';picker.innerHTML='<option value="">Choisir une fraction compatible</option>'+candidates.map(({candidate})=>'<option value="'+esc(candidate.id)+'">'+esc(candidate.ap_numero+' · '+candidate.client+' · '+candidate.date_commande)+'</option>').join('');
          const join=document.createElement('button');join.type='button';join.className='btn btn-primary';join.textContent='Regrouper les cartons';
          join.onclick=async()=>{
            if(!picker.value){status.textContent='Choisissez une fraction compatible.';return;}
            if(!confirm('Regrouper volontairement ces fractions dans les mêmes cartons ? Les numéros APN° et la traçabilité des paquets seront conservés.'))return;
            join.disabled=true;
            try{const {error}=await state.sb.rpc('ap_regrouper_fractions',{p_commande:order.id,p_avec:picker.value});if(error)throw error;await refreshSnapshot();render();status.textContent='Fractions regroupées. Les cartons sont communs aux commandes sélectionnées.';}
            catch(error){status.textContent=error.message+(error.code==='PGRST202'?' Exécutez le nouveau script SQL de regroupement des fractions.':'');}
            finally{join.disabled=false;}
          };grouping.append(picker,join);
        }else{const note=document.createElement('p');note.className='text-xs';note.textContent='Aucune autre fraction compatible avec les paquets actuellement disponibles.';grouping.append(note);}
        if(membership){
          const split=document.createElement('button');split.type='button';split.className='btn btn-secondary';split.textContent='Dissocier les fractions';split.onclick=async()=>{
            if(!confirm('Rétablir un colisage séparé pour ces fractions ?'))return;
            split.disabled=true;
            try{const {error}=await state.sb.rpc('ap_dissocier_fractions',{p_groupe:membership.id});if(error)throw error;await refreshSnapshot();render();status.textContent='Fractions dissociées.';}catch(error){status.textContent=error.message;}finally{split.disabled=false;}
          };grouping.append(split);
        }
        output.append(grouping);
      }
      button.disabled=!rows;
    }
    select.addEventListener('change',render);
    if(orders.some(order=>order.id===requested)) select.value=requested;
    render();
    if(requested) section.scrollIntoView({block:'start'});
    button.addEventListener('click',async()=>{
      const sheet=document.getElementById('apPackingSheet');
      const printable=output.cloneNode(true);
      printable.querySelectorAll('button,.no-print').forEach(element=>element.remove());
      sheet.innerHTML='<div class="print-brand"><img src="assets/logitrak-eurequat.jpg" alt="LogiTrak" width="2752" height="1536"></div><h1>Colisage Algérie Poste</h1>'+printable.innerHTML;
      document.body.classList.add('ap-printing');
      try { await printLogiTrakDocument(sheet); }
      finally { document.body.classList.remove('ap-printing'); }
    });
  } catch(error) { output.textContent=error.message||'Colisage Algérie Poste indisponible.'; }
}
