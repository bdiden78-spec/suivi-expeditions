const machineForm = document.querySelector('#machineForm');
const machineStatus = document.querySelector('#machineMessage');
const machineList = document.querySelector('#machineList');
const escapeMachine = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let machineDB, machineAdmin, editedMachine;
let machines = [];

function toggleTheme() {
  const light = document.documentElement.classList.toggle('light');
  try { localStorage.setItem('logitrak_theme', light ? 'light' : 'dark'); } catch {}
  document.querySelector('#themeIcon').className = 'fa-solid ' + (light ? 'fa-moon' : 'fa-sun');
}
function machineAge(start, today) {
  if (!start || start > today) return '—';
  const months = (Number(today.slice(0,4))-Number(start.slice(0,4)))*12
    + Number(today.slice(5,7))-Number(start.slice(5,7))-(today.slice(8)<start.slice(8)?1:0);
  return Math.floor(months/12)+' an(s) et '+months%12+' mois';
}
async function loadMachines(openId) {
  const [registry, interventions] = await Promise.all([
    readLogiTrakRows(machineDB,'machines_usine'), readLogiTrakRows(machineDB,'machines_interventions'),
  ]);
  machines = registry.sort((a,b)=>a.nom.localeCompare(b.nom));
  const today = logitrakToday();
  machineList.innerHTML = machines.map(machine=>{
    const e=escapeMachine, events=interventions.filter(event=>event.machine_id===machine.id)
      .sort((a,b)=>b.date_intervention.localeCompare(a.date_intervention));
    return '<details class="panel p-4" '+(openId===machine.id?'open':'')+'><summary class="cursor-pointer"><b>'+e(machine.nom)+'</b> · '+e(machine.etat)+
      (machine.imprimante_ap?' · Imprimante Algérie Poste':'')+'</summary><div class="mt-3 space-y-2">'+
      '<p>'+e(machine.marque)+' · '+e(machine.reference)+' · Série '+e(machine.numero_serie)+'</p>'+
      '<p>Mise en service '+e(machine.mise_en_service||'—')+' · Âge '+machineAge(machine.mise_en_service,today)+'</p>'+
      '<p>Prochain entretien préventif '+e(machine.prochain_preventif||'—')+(machine.prochain_preventif&&machine.prochain_preventif<today?' · En retard':'')+'</p>'+
      '<p>'+e(machine.notes)+'</p><h3 class="font-bold">Historique des interventions</h3>'+
      (events.length?'<ul class="space-y-1">'+events.map(event=>'<li>'+e(event.date_intervention)+' · '+e(event.type)+' · '+e(event.description)+'</li>').join('')+'</ul>':'<p>Aucune intervention enregistrée.</p>')+
      (machineAdmin?'<button class="btn btn-secondary" type="button" data-edit="'+e(machine.id)+'">Modifier la fiche</button>'+
        '<form data-intervention="'+e(machine.id)+'" class="grid sm:grid-cols-2 gap-2"><label>Date<input class="inp" name="date_intervention" type="date" value="'+today+'" required></label>'+
        '<label>Type<select class="inp" name="type"><option>Préventif</option><option>Correctif</option><option>Contrôle</option></select></label>'+
        '<label>Description<input class="inp" name="description" required></label><button class="btn btn-primary self-end">Ajouter une intervention</button></form>':'')+
      '</div></details>';
  }).join('') || '<p>Aucune machine enregistrée.</p>';
}
async function machineAction(button, action) {
  button.disabled=true;
  try { await action(); machineStatus.textContent='Enregistré.'; }
  catch(error) { machineStatus.textContent=error.message; }
  finally { button.disabled=false; }
}
document.querySelector('#machineReset').onclick=()=>{
  editedMachine=null;
  machineForm.reset();
  machineForm.elements.nom.readOnly=false;
};
machineForm.onsubmit=event=>{
  event.preventDefault();
  if(!machineAdmin) return;
  const payload=Object.fromEntries(new FormData(machineForm));
  payload.nom=payload.nom.trim().toUpperCase();
  payload.imprimante_ap=machineForm.elements.imprimante_ap.checked;
  for(const key of ['mise_en_service','prochain_preventif']) payload[key] ||= null;
  return machineAction(event.submitter,async()=>{
    const query=editedMachine?machineDB.from('machines_usine').update(payload).eq('id',editedMachine):machineDB.from('machines_usine').insert(payload);
    const {data,error}=await query.select('id').single();
    if(error) throw error;
    document.querySelector('#machineReset').click();
    await loadMachines(data.id);
  });
};
machineList.onclick=event=>{
  const button=event.target.closest('[data-edit]');
  if(!button||!machineAdmin) return;
  const machine=machines.find(row=>row.id===button.dataset.edit);
  editedMachine=machine.id;
  for(const field of machineForm.elements) {
    if(!Object.hasOwn(machine,field.name)) continue;
    if(field.type==='checkbox') field.checked=machine[field.name];
    else field.value=machine[field.name]??'';
  }
  machineForm.elements.nom.readOnly=true;
  machineForm.scrollIntoView({block:'start'});
};
machineList.onsubmit=event=>{
  event.preventDefault();
  if(!machineAdmin||!event.target.dataset.intervention) return;
  const payload={...Object.fromEntries(new FormData(event.target)),machine_id:event.target.dataset.intervention};
  return machineAction(event.submitter,async()=>{
    const {error}=await machineDB.from('machines_interventions').insert(payload);
    if(error) throw error;
    await loadMachines(payload.machine_id);
  });
};
async function startMachines() {
  try {
    const get=key=>{try{return localStorage.getItem(key);}catch{return null;}};
    machineDB=window.supabase.createClient(get('supabase_url')||SUPABASE_URL,get('supabase_key')||SUPABASE_ANON);
    const {data,error}=await machineDB.auth.getSession();
    if(error) throw error;
    const username=data.session?.user?.email?.split('@')[0];
    if(!username) { machineStatus.textContent='Connectez-vous depuis l’accueil pour consulter les machines.'; return; }
    const role=await machineDB.from('operateurs').select('role').eq('username',username).maybeSingle();
    if(role.error) throw role.error;
    if(!role.data) { machineStatus.textContent='Compte opérateur requis.'; return; }
    machineAdmin=role.data.role==='admin';
    document.body.classList.toggle('is-admin',machineAdmin);
    document.body.classList.add('is-operator');
    if(!machineAdmin) { machineStatus.textContent='Accès réservé aux administrateurs.'; return; }
    machineForm.hidden=false;
    document.querySelector('#accountSettings').hidden=false;
    await Promise.all([loadAccountSettings(),loadMachines()]);
  } catch(error) { machineStatus.textContent=error.message; }
}
async function loadAccountSettings() {
  const form=document.querySelector('#accountEdit');
  const {data,error}=await machineDB.from('operateurs').select('username').order('username');
  if(error) throw error;
  form.elements.current.replaceChildren(...data.map(row=>new Option(row.username,row.username)));
  const sync=()=>{form.elements.username.value=form.elements.current.value;form.elements.password.value='';};
  form.elements.current.onchange=sync;
  sync();
  form.onsubmit=event=>{
    event.preventDefault();
    const fields=form.elements;
    return machineAction(event.submitter,async()=>{
      const {error}=await machineDB.rpc('edit_logitrak_operator',{
        p_current:fields.current.value,p_username:fields.username.value.trim().toLowerCase(),p_password:fields.password.value,
      });
      fields.password.value='';
      if(error) throw error;
      await loadAccountSettings();
    });
  };
}
document.querySelector('#accountCreate').onsubmit=event=>{
  event.preventDefault();
  if(!machineAdmin) return;
  const form=event.currentTarget, fields=form.elements;
  return machineAction(event.submitter,async()=>{
    const {error}=await machineDB.rpc('create_operator',{
      p_username:fields.username.value.trim().toLowerCase(),p_password:fields.password.value,p_role:fields.role.value,
    });
    fields.password.value='';
    if(error) throw error;
    form.reset();
    await loadAccountSettings();
  });
};
startMachines();
