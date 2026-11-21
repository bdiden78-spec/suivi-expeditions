const machineForm = document.querySelector('#machineForm');
const machineStatus = document.querySelector('#machineMessage');
const machineList = document.querySelector('#machineList');
const escapeMachine = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let machineDB, machineAdmin, editedMachine;
let machines = [];

function toggleTheme() {
  // Le thème sombre est supprimé au profit d'un design clair moderne permanent.
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
    return '<details class="panel p-4" '+(openId===machine.id?'open':'')+'><summary class="cursor-pointer font-bold text-slate-800"><b>'+e(machine.nom)+'</b> · '+e(machine.etat)+
      (machine.imprimante_ap?' · <span class="badge" style="background:#ffedd5;color:#ea580c">Imprimante Algérie Poste</span>':'')+'</summary><div class="mt-3 space-y-2 text-xs text-slate-600">'+
      '<p><span class="font-semibold text-slate-700">Modèle :</span> '+e(machine.marque)+' · '+e(machine.reference)+' · <span class="font-mono-code font-bold text-slate-800">Série '+e(machine.numero_serie)+'</span></p>'+
      '<p><span class="font-semibold text-slate-700">Mise en service :</span> '+e(machine.mise_en_service||'—')+' · Âge : '+machineAge(machine.mise_en_service,today)+'</p>'+
      '<p><span class="font-semibold text-slate-700">Prochain entretien préventif :</span> '+e(machine.prochain_preventif||'—')+(machine.prochain_preventif&&machine.prochain_preventif<today?' · <span class="text-rose-600 font-bold">En retard</span>':'')+'</p>'+
      (machine.notes?'<p class="italic text-slate-500">'+e(machine.notes)+'</p>':'')+
      '<h4 class="font-bold text-xs uppercase tracking-wider text-slate-700 pt-2">Historique des interventions</h4>'+
      (events.length?'<ul class="space-y-1">'+events.map(event=>'<li class="p-2 rounded bg-slate-50 border border-slate-200"><b>'+e(event.date_intervention)+'</b> · <span class="badge" style="background:#e0f2fe;color:#0284c7">'+e(event.type)+'</span> · '+e(event.description)+'</li>').join('')+'</ul>':'<p class="text-slate-400 italic">Aucune intervention enregistrée.</p>')+
      (machineAdmin?'<div class="pt-2 flex flex-wrap gap-2 items-center"><button class="btn btn-secondary text-xs" type="button" data-edit="'+e(machine.id)+'"><i class="fa-solid fa-pen-to-square mr-1"></i>Modifier la fiche</button></div>'+
        '<form data-intervention="'+e(machine.id)+'" class="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-3 border-t border-slate-200"><label class="block text-xs font-semibold">Date<input class="inp mt-1" name="date_intervention" type="date" value="'+today+'" required></label>'+
        '<label class="block text-xs font-semibold">Type<select class="inp mt-1" name="type"><option>Préventif</option><option>Correctif</option><option>Contrôle</option></select></label>'+
        '<label class="block text-xs font-semibold sm:col-span-2">Description<input class="inp mt-1" name="description" placeholder="Détail de l\'opération..." required></label><button class="btn btn-primary self-end lg:col-span-4"><i class="fa-solid fa-wrench mr-1"></i>Ajouter une intervention</button></form>':'')+
      '</div></details>';
  }).join('') || '<p class="text-slate-500 italic p-4 text-center">Aucune machine enregistrée.</p>';
}

async function machineAction(button, action) {
  if (button) button.disabled = true;
  try {
    await action();
    if (machineStatus) {
      machineStatus.textContent = 'Enregistré avec succès.';
      machineStatus.className = 'text-sm font-semibold text-emerald-600';
      setTimeout(() => { if (machineStatus) machineStatus.textContent = ''; }, 4000);
    }
  } catch(error) {
    if (machineStatus) {
      machineStatus.textContent = 'Erreur : ' + error.message;
      machineStatus.className = 'text-sm font-semibold text-rose-600';
    }
  } finally {
    if (button) button.disabled = false;
  }
}

document.querySelector('#machineReset').onclick = () => {
  editedMachine = null;
  machineForm.reset();
  machineForm.elements.nom.readOnly = false;
};

machineForm.onsubmit = event => {
  event.preventDefault();
  if (!machineAdmin) return;
  const payload = Object.fromEntries(new FormData(machineForm));
  payload.nom = payload.nom.trim().toUpperCase();
  payload.imprimante_ap = machineForm.elements.imprimante_ap.checked;
  for (const key of ['mise_en_service','prochain_preventif']) payload[key] ||= null;
  return machineAction(event.submitter, async () => {
    const query = editedMachine ? machineDB.from('machines_usine').update(payload).eq('id', editedMachine) : machineDB.from('machines_usine').insert(payload);
    const { data, error } = await query.select('id').single();
    if (error) throw error;
    document.querySelector('#machineReset').click();
    await loadMachines(data.id);
  });
};

machineList.onclick = event => {
  const button = event.target.closest('[data-edit]');
  if (!button || !machineAdmin) return;
  const machine = machines.find(row => row.id === button.dataset.edit);
  if (!machine) return;
  editedMachine = machine.id;
  for (const field of machineForm.elements) {
    if (!Object.hasOwn(machine, field.name)) continue;
    if (field.type === 'checkbox') field.checked = machine[field.name];
    else field.value = machine[field.name] ?? '';
  }
  machineForm.elements.nom.readOnly = true;
  machineForm.scrollIntoView({ block: 'start', behavior: 'smooth' });
};

machineList.onsubmit = event => {
  event.preventDefault();
  if (!machineAdmin || !event.target.dataset.intervention) return;
  const payload = { ...Object.fromEntries(new FormData(event.target)), machine_id: event.target.dataset.intervention };
  return machineAction(event.submitter, async () => {
    const { error } = await machineDB.from('machines_interventions').insert(payload);
    if (error) throw error;
    await loadMachines(payload.machine_id);
  });
};

async function startMachines() {
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

  try {
    const get = key => { try { return localStorage.getItem(key); } catch { return null; } };
    const u = get('supabase_url') || SUPABASE_URL, k = get('supabase_key') || SUPABASE_ANON;
    machineDB = typeof getLogiTrakClient === 'function' ? getLogiTrakClient(u, k) : window.supabase.createClient(u, k);
    let session = typeof getLogiTrakSession === 'function' ? getLogiTrakSession() : null;
    if (!session && machineDB) {
      const res = await Promise.race([
        machineDB.auth.getSession().catch(() => ({ data: { session: null } })),
        new Promise(r => setTimeout(() => r({ data: { session: null } }), 400))
      ]);
      session = res?.data?.session;
    }
    const username = session?.user?.email?.split('@')[0];
    if (!username) {
      machineStatus.textContent = 'Connectez-vous depuis l’accueil pour accéder aux paramètres.';
      machineStatus.className = 'text-sm font-semibold text-amber-600';
      return;
    }
    const role = await machineDB.from('operateurs').select('role').eq('username', username).maybeSingle();
    if (role.error) throw role.error;
    if (!role.data) {
      machineStatus.textContent = 'Compte opérateur requis.';
      machineStatus.className = 'text-sm font-semibold text-rose-600';
      return;
    }
    machineAdmin = role.data.role === 'admin';
    document.body.classList.toggle('is-admin', machineAdmin);
    document.body.classList.add('is-operator');
    if (!machineAdmin) {
      location.replace('index.html');
      return;
    }
    machineForm.hidden = false;
    document.querySelector('#accountSettings').hidden = false;
    await Promise.all([loadAccountSettings(), loadMachines()]);
  } catch(error) {
    machineStatus.textContent = error.message;
    machineStatus.className = 'text-sm font-semibold text-rose-600';
  }
}

/* ---------- Gestion des Comptes Utilisateurs ---------- */
async function loadAccountSettings() {
  const form = document.querySelector('#accountEdit');
  const { data, error } = await machineDB.from('operateurs').select('username').order('username');
  if (error) throw error;
  form.elements.current.replaceChildren(...data.map(row => new Option(row.username, row.username)));
  const sync = () => { form.elements.username.value = form.elements.current.value; form.elements.password.value = ''; };
  form.elements.current.onchange = sync;
  sync();
  form.onsubmit = event => {
    event.preventDefault();
    const fields = form.elements;
    return machineAction(event.submitter, async () => {
      const { error } = await machineDB.rpc('edit_logitrak_operator', {
        p_current: fields.current.value, p_username: fields.username.value.trim().toLowerCase(), p_password: fields.password.value,
      });
      fields.password.value = '';
      if (error) throw error;
      await loadAccountSettings();
    });
  };
}

document.querySelector('#accountCreate').onsubmit = event => {
  event.preventDefault();
  if (!machineAdmin) return;
  const form = event.currentTarget, fields = form.elements;
  return machineAction(event.submitter, async () => {
    const { error } = await machineDB.rpc('create_operator', {
      p_username: fields.username.value.trim().toLowerCase(), p_password: fields.password.value, p_role: fields.role.value,
    });
    fields.password.value = '';
    if (error) throw error;
    form.reset();
    await loadAccountSettings();
  });
};

startMachines();
