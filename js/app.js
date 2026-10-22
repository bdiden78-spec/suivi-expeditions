// --- Filets de sécurité : une erreur s'affiche en rouge en bas de la page au lieu de tout bloquer
function showFatal(msg) {
    let b = document.getElementById('fatalBar');
    if (!b) { b = document.createElement('div'); b.id = 'fatalBar'; b.className = 'fixed bottom-0 inset-x-0 z-[60] bg-rose-700 text-white text-xs p-3 text-center'; document.body.appendChild(b); }
    b.textContent = 'Erreur : ' + msg;
}
window.addEventListener('error', e => showFatal(e.message));
window.addEventListener('unhandledrejection', e => showFatal((e.reason && e.reason.message) || e.reason));
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('délai dépassé')), ms))]); }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

let supabaseClient = null;
        let allExpeditions = [];
        let currentView = 'date';
        let allAccordionsExpanded = true;
        let isOperator = false;
        function syncThemeIcon() {
            const l = document.documentElement.classList.contains('light');
            document.getElementById('themeIcon').className = 'fa-solid text-sm text-indigo-400 ' + (l ? 'fa-moon' : 'fa-sun');
        }
        function toggleTheme() {
            const l = document.documentElement.classList.toggle('light');
            try { localStorage.setItem('logitrak_theme', l ? 'light' : 'dark'); } catch (e) {}
            syncThemeIcon();
        }
        function explain(e) {
            const m = (e && e.message) || 'erreur inconnue';
            return /row-level security|permission denied/i.test(m) ? "permission refusée (les règles RLS de Supabase ne sont pas configurées pour les opérateurs)" : m;
        }
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        function esc(v) {
            return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        }
        let isAdmin = false, currentSession = null;
        async function refreshRole(session) {
            currentSession = session; isOperator = false; isAdmin = false;
            if (session && supabaseClient) {
                const { data, error } = await supabaseClient.from('operateurs').select('role').eq('email', (session.user.email || '').toLowerCase()).maybeSingle();
                if (error) showToast("Rôles indisponibles : exécutez sql/setup.sql dans Supabase.", "error");
                else if (data) { isOperator = true; isAdmin = data.role === 'admin'; }
                else showToast("Compte connecté, mais pas encore autorisé : demandez à un administrateur de vous ajouter.", "warning");
            }
            document.body.classList.toggle('is-operator', isOperator);
            document.body.classList.toggle('is-admin', isAdmin);
            document.getElementById('authBtnText').textContent = session ? 'Déconnexion' : 'Espace opérateur';
            document.getElementById('authBtn').title = session ? (session.user.email || '') : 'Espace opérateur';
        }
        async function initAuth() {
            if (!supabaseClient) return;
            const { data } = await supabaseClient.auth.getSession();
            await refreshRole(data.session);
            supabaseClient.auth.onAuthStateChange((_evt, sess) => setTimeout(() => refreshRole(sess), 0));
        }
        function authAction() {
            if (isOperator) { if (confirm('Se déconnecter ?')) supabaseClient.auth.signOut(); }
            else showModal('loginModal');
        }
        async function doLogin(ev) {
            ev.preventDefault();
            const err = document.getElementById('loginError');
            err.classList.add('hidden');
            if (!supabaseClient) { err.textContent = 'Base indisponible.'; err.classList.remove('hidden'); return; }
            const { error } = await supabaseClient.auth.signInWithPassword({
                email: document.getElementById('loginEmail').value.trim(),
                password: document.getElementById('loginPassword').value
            });
            if (error) {
                const m = (error.message || '').toLowerCase();
                err.textContent = m.includes('confirm') ? "E-mail non confirmé : dans Supabase > Authentication > Users, confirmez ce compte."
                    : m.includes('invalid login') ? "E-mail ou mot de passe incorrect, ou ce compte n'existe pas encore dans Supabase."
                    : "Connexion impossible : " + error.message;
                err.classList.remove('hidden'); return;
            }
            document.getElementById('loginPassword').value = '';
            hideModal('loginModal');
            showToast('Connexion réussie.', 'success');
        }
        async function doSignUp() {
            const err = document.getElementById('loginError'), info = document.getElementById('loginInfo');
            err.classList.add('hidden'); info.classList.add('hidden');
            const email = document.getElementById('loginEmail').value.trim().toLowerCase();
            const password = document.getElementById('loginPassword').value;
            if (!email || password.length < 6) { err.textContent = 'Saisissez un e-mail et un mot de passe de 6 caractères minimum.'; err.classList.remove('hidden'); return; }
            if (!supabaseClient) { err.textContent = 'Base indisponible.'; err.classList.remove('hidden'); return; }
            const { error } = await supabaseClient.auth.signUp({ email, password });
            if (error) { err.textContent = 'Création impossible : ' + error.message; err.classList.remove('hidden'); return; }
            info.textContent = "Compte créé. Confirmez votre e-mail si on vous le demande, puis faites-vous autoriser par un administrateur.";
            info.classList.remove('hidden');
        }
        function requireOperator() {
            if (isOperator && supabaseClient) return true;
            showToast(currentSession ? "Votre compte n'est pas encore autorisé à modifier." : "Réservé aux opérateurs : connectez-vous.", "warning");
            if (!currentSession) showModal('loginModal');
            return false;
        }
        async function openOperators() {
            if (!isAdmin) return;
            showModal('opsModal');
            await loadOperators();
        }
        async function loadOperators() {
            const box = document.getElementById('opsList');
            const { data, error } = await supabaseClient.from('operateurs').select('*').order('created_at', { ascending: true });
            if (error) { box.innerHTML = `<p class="py-3 text-rose-400">${esc(explain(error))}</p>`; return; }
            const me = (currentSession.user.email || '').toLowerCase();
            box.innerHTML = (data || []).map(o => `
                <div class="py-3 flex items-center justify-between gap-3">
                    <div class="min-w-0"><div class="font-semibold text-slate-200 truncate">${esc(o.email)}</div>
                    <div class="text-slate-400">${o.role === 'admin' ? 'Administrateur' : 'Opérateur'}</div></div>
                    ${o.email === me ? '<span class="text-slate-500">vous</span>' : `<button data-email="${esc(o.email)}" onclick="removeOperator(this.dataset.email)" class="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold">Retirer</button>`}
                </div>`).join('') || '<p class="py-3 text-slate-400">Aucun opérateur.</p>';
        }
        async function addOperator(ev) {
            ev.preventDefault();
            const email = document.getElementById('opEmail').value.trim().toLowerCase();
            const role = document.getElementById('opRole').value;
            const { error } = await supabaseClient.from('operateurs').upsert({ email, role });
            if (error) { showToast("Ajout impossible : " + explain(error), "error"); return; }
            document.getElementById('opEmail').value = '';
            showToast("Autorisation enregistrée.", "success");
            await loadOperators();
        }
        async function removeOperator(email) {
            if (!confirm("Retirer l'accès en modification à " + email + " ?")) return;
            const { error } = await supabaseClient.from('operateurs').delete().eq('email', email);
            if (error) { showToast("Retrait impossible : " + explain(error), "error"); return; }
            showToast("Accès retiré.", "success");
            await loadOperators();
        }
        function nextBL(d) {
            const y = (d || '').slice(0, 4) || String(new Date().getFullYear());
            const re = new RegExp('^BL-' + y + '-(\\d+)$');
            let m = 0;
            allExpeditions.forEach(e => { const r = re.exec(e.numero_bl || ''); if (r) m = Math.max(m, +r[1]); });
            return 'BL-' + y + '-' + String(m + 1).padStart(3, '0');
        }
        function fillFilterOptions() {
            const years = [...new Set(allExpeditions.map(e => (e.date_envoi || '').slice(0, 4)).filter(Boolean))].sort().reverse();
            const dests = [...new Set(allExpeditions.flatMap(e => (e.items || []).map(i => (i.destinataire || '').trim().toUpperCase())).filter(Boolean))].sort();
            const fill = (id, first, vals) => {
                const sel = document.getElementById(id), cur = sel.value;
                sel.innerHTML = `<option value="all">${first}</option>` + vals.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
                sel.value = vals.includes(cur) ? cur : 'all';
            };
            fill('filterYear', '🌐 Toutes les années', years);
            fill('filterDest', '🏢 Tous destinataires', dests);
        }

        // Sample starting records for 2027
        const defaultSamples2027 = [
            {
                id: 'exp-sample-01',
                date_envoi: '2027-01-05',
                numero_bl: 'BL-2027-001',
                transporteur: 'YAZID',
                observations: 'Départ direct usine vers UPW Beni Abbes (Lot d\'étiquettes)',
                statut: 'Expédié',
                items: [
                    { id: 'it-1', reference: 'E02CL38B1', designation: 'ETIQUETTE TT 105*148 (RR 3EX)', destinataire: 'UPW BENI ABBES', unite: 'ID', quantite: '15000', cartons: '1' }
                ]
            },
            {
                id: 'exp-sample-02',
                date_envoi: '2027-01-07',
                numero_bl: 'BL-2027-002',
                transporteur: 'YAZID',
                observations: 'Livraison Smartware + retour en stock atelier',
                statut: 'Expédié',
                items: [
                    { id: 'it-2', reference: 'R2A045300BN', designation: 'RUBAN CIRE 45*300', destinataire: 'SMARTWARE', unite: 'UN', quantite: '644', cartons: '11' },
                    { id: 'it-3', reference: 'R2C110300BO', designation: 'RUBAN RESINE 110*300', destinataire: 'STOCK', unite: 'UN', quantite: '44', cartons: '1' },
                    { id: 'it-4', reference: 'RXC060300BN', designation: 'RUBAN RESINE EXTRA 60*300', destinataire: 'STOCK', unite: 'UN', quantite: '16', cartons: '1' },
                    { id: 'it-5', reference: 'E06CL25B1', designation: 'ETIQUETTE PET M /S 105*30', destinataire: 'STOCK', unite: 'UN', quantite: '40', cartons: '3' },
                    { id: 'it-6', reference: 'PVC-100', designation: 'CARTE PVC BLANCHE 0.75mm', destinataire: 'STOCK', unite: 'UN', quantite: '47', cartons: '2' }
                ]
            },
            {
                id: 'exp-sample-03',
                date_envoi: '2027-01-15',
                numero_bl: 'BL-2027-003',
                transporteur: 'YALIDINE',
                observations: 'Colis express Yalidine - Livraison Alger',
                statut: 'Expédié',
                items: [
                    { id: 'it-7', reference: 'PVC-100-AC', designation: 'PVC ADHESIVE CARD', destinataire: 'SOLINF', unite: 'UN', quantite: '19', cartons: '1' },
                    { id: 'it-8', reference: 'E06CH13D1', designation: 'ETIQUETTE PET M /S 70*30', destinataire: 'TOSYALI', unite: 'UN', quantite: '30', cartons: '2' }
                ]
            }
        ];

        // Safe Initialization
        window.addEventListener('DOMContentLoaded', async () => {
            const step = async (nom, fn) => { try { await fn(); } catch (e) { console.error(nom, e); showFatal(nom + ' : ' + (e.message || e)); } };
            await step('thème', syncThemeIcon);
            await step('connexion', initSupabase);
            await step('données', fetchData);
            await step('compte', () => withTimeout(initAuth(), 8000));
        });

        function initSupabase() {
            const url = lsGet('supabase_url') || SUPABASE_URL;
            const key = lsGet('supabase_key') || SUPABASE_ANON;

            document.getElementById('supabaseUrlInput').value = url;
            document.getElementById('supabaseKeyInput').value = key;

            try {
                if (window.supabase) {
                    supabaseClient = window.supabase.createClient(url, key);
                    setDbBadge(true, "Supabase Connecté");
                } else {
                    setDbBadge(false, "SDK en attente");
                }
            } catch (err) {
                console.error("Supabase init error:", err);
                setDbBadge(false, "Erreur Connexion");
            }
        }

        function setDbBadge(isOnline, text) {
            const badge = document.getElementById('dbStatusBadge');
            const txt = document.getElementById('dbStatusText');
            const ping = document.getElementById('dbPing');
            const dot = document.getElementById('dbDot');
            const adminState = document.getElementById('adminDbState');

            txt.textContent = text;
            if (isOnline) {
                badge.className = "flex items-center space-x-2 bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-emerald-950/50 backdrop-blur-md cursor-pointer hover:border-emerald-400 transition";
                ping.className = "animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75";
                dot.className = "relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500";
                if (adminState) {
                    adminState.className = "px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
                    adminState.textContent = "Connecté & Actif";
                }
            } else {
                badge.className = "flex items-center space-x-2 bg-amber-950/60 text-amber-400 border border-amber-500/30 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-amber-950/50 backdrop-blur-md cursor-pointer hover:border-amber-400 transition";
                ping.className = "hidden";
                dot.className = "relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500";
                if (adminState) {
                    adminState.className = "px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30";
                    adminState.textContent = "Mode Local (Hors ligne)";
                }
            }
        }

        // Fetch Data from Supabase with graceful fallback
        async function fetchData() {
            let loaded = false;
            if (supabaseClient) {
                try {
                    const { data: exps, error: expErr } = await supabaseClient.from('expeditions').select('*').order('date_envoi', { ascending: false });
                    if (expErr) throw expErr;
                    let r = await supabaseClient.from('lignes_expedition').select('*').order('created_at', { ascending: true });
                    if (r.error) r = await supabaseClient.from('lignes_expedition').select('*');
                    if (r.error) throw r.error;
                    const lines = r.data || [];
                    allExpeditions = (exps || []).map(e => ({
                        id: e.id, date_envoi: e.date_envoi, numero_bl: e.numero_bl || '',
                        transporteur: e.transporteur || 'AUTRE', observations: e.observations || '',
                        statut: e.statut || 'Expédié',
                        items: lines.filter(l => l.expedition_id === e.id).map(rl => ({
                            id: rl.id, reference: rl.reference || '', designation: rl.designation || '',
                            destinataire: rl.destinataire || 'STOCK', unite: rl.unite || 'UN',
                            quantite: rl.quantite || '0', cartons: rl.cartons || '1'
                        }))
                    }));
                    loaded = true;
                    saveToLocalStorage();
                    setDbBadge(true, "En ligne (" + allExpeditions.length + ")");
                } catch (e) {
                    console.warn("Lecture Supabase impossible :", e);
                    setDbBadge(false, "Hors ligne • copie locale");
                }
            } else {
                setDbBadge(false, "Hors ligne • copie locale");
            }
            if (!loaded) {
                try { allExpeditions = JSON.parse(lsGet('eurequat_expeditions_v2027') || '[]'); }
                catch (e) { allExpeditions = []; }
            }
            fillFilterOptions();
            applyFilters();
        }

        function saveToLocalStorage() {
            try { localStorage.setItem('eurequat_expeditions_v2027', JSON.stringify(allExpeditions)); } catch (e) {}
        }

        // Update top KPI cards
        function updateKPIs() {
            let totalCartons = 0;
            let totalItems = 0;
            const carrierCount = {};

            (window._filtered || allExpeditions).forEach(exp => {
                const c = exp.transporteur || 'AUTRE';
                carrierCount[c] = (carrierCount[c] || 0) + 1;

                (exp.items || []).forEach(it => {
                    totalItems++;
                    const cNum = parseInt(it.cartons) || 1;
                    totalCartons += cNum;
                });
            });

            document.getElementById('kpiShipmentDays').textContent = (window._filtered || allExpeditions).length;
            document.getElementById('kpiTotalItems').textContent = totalItems;
            document.getElementById('kpiTotalCartons').textContent = totalCartons;

            let topCarrier = '—';
            let maxC = 0;
            for (const [k, v] of Object.entries(carrierCount)) {
                if (v > maxC) {
                    maxC = v;
                    topCarrier = k;
                }
            }
            const yv = document.getElementById('filterYear').value;
            document.getElementById('kpiCurrentYearLabel').textContent = yv === 'all' ? 'Toutes années' : yv;
            document.getElementById('kpiTopCarrier').textContent = topCarrier;
            document.getElementById('kpiCarrierShare').textContent = maxC + " départs";
        }

        // Apply filters
        function applyFilters() {
            const query = (document.getElementById('searchInput').value || '').toLowerCase().trim();
            const year = document.getElementById('filterYear').value;
            const carrier = document.getElementById('filterCarrier').value;
            const destFilter = document.getElementById('filterDest').value;

            const filtered = allExpeditions.filter(exp => {
                // Year filter
                if (year !== 'all') {
                    if (!exp.date_envoi || !exp.date_envoi.startsWith(year)) return false;
                }
                // Carrier filter
                if (carrier !== 'all') {
                    if (exp.transporteur !== carrier) return false;
                }
                // Destination filter
                if (destFilter !== 'all') {
                    const hasDest = (exp.items || []).some(it => (it.destinataire || '').toUpperCase().includes(destFilter));
                    if (!hasDest) return false;
                }
                // Search query
                if (query) {
                    const inHeader = (exp.date_envoi || '').toLowerCase().includes(query) ||
                                     (exp.numero_bl || '').toLowerCase().includes(query) ||
                                     (exp.transporteur || '').toLowerCase().includes(query) ||
                                     (exp.observations || '').toLowerCase().includes(query);
                    if (inHeader) return true;

                    const inItems = (exp.items || []).some(it => 
                        (it.reference || '').toLowerCase().includes(query) ||
                        (it.designation || '').toLowerCase().includes(query) ||
                        (it.destinataire || '').toLowerCase().includes(query)
                    );
                    return inItems;
                }
                return true;
            });

            window._filtered = filtered;
            renderAccordionView(filtered);
            updateKPIs();
            renderTableView(filtered);
        }

        // Render Accordion Date Cards
        function renderAccordionView(data) {
            const container = document.getElementById('dateViewContainer');
            
            if (data.length === 0) {
                container.innerHTML = `
                    <div class="p-12 text-center rounded-3xl bg-slate-900/60 border border-slate-800 text-slate-400">
                        <i class="fa-regular fa-folder-open text-5xl text-slate-600 mb-3 block"></i>
                        <h4 class="text-base font-bold text-slate-200">Aucun départ trouvé</h4>
                        <p class="text-xs text-slate-500 mt-1">Aucune expédition ne correspond à vos filtres de recherche.</p>
                        <button onclick="resetFilters()" class="mt-4 px-4 py-2 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-xl text-xs font-bold transition">
                            Réinitialiser les filtres
                        </button>
                    </div>
                `;
                return;
            }

            container.innerHTML = data.map(exp => {
                const totalCartons = (exp.items || []).reduce((acc, it) => acc + (parseInt(it.cartons) || 1), 0);
                const itemsCount = (exp.items || []).length;
                const isExpanded = allAccordionsExpanded;

                return `
                    <div class="rounded-2xl bg-slate-900/90 border border-slate-800/90 shadow-xl overflow-hidden transition-all duration-300 hover:border-slate-700">
                        
                        <!-- Accordion Header -->
                        <div class="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 cursor-pointer select-none bg-gradient-to-r from-slate-900/90 via-slate-850 to-slate-900/90" onclick="toggleAccordion('content-${esc(exp.id)}', 'icon-${esc(exp.id)}')">
                            
                            <!-- Date & BL Info -->
                            <div class="flex items-center space-x-4">
                                <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex flex-col items-center justify-center shadow-lg shadow-indigo-500/20">
                                    <span class="text-[9px] font-black uppercase tracking-widest leading-none">${formatDayName(exp.date_envoi)}</span>
                                    <span class="text-sm font-black leading-none mt-1">${formatDayNumber(exp.date_envoi)}</span>
                                </div>

                                <div>
                                    <div class="flex items-center space-x-2.5">
                                        <h3 class="font-extrabold text-sm sm:text-base text-white tracking-tight">${esc(exp.date_envoi)}</h3>
                                        <span class="px-2.5 py-0.5 rounded-lg text-xs font-black font-mono-code bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                            ${esc(exp.numero_bl || 'BL')}
                                        </span>
                                    </div>

                                    <div class="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-400">
                                        <span class="inline-flex items-center gap-1 font-semibold text-slate-200">
                                            <i class="fa-solid fa-truck text-indigo-400 text-[11px]"></i>
                                            ${esc(exp.transporteur)}
                                        </span>
                                        <span>•</span>
                                        <span class="inline-flex items-center gap-1 font-bold text-amber-400">
                                            <i class="fa-solid fa-box text-amber-500 text-[11px]"></i>
                                            ${totalCartons} carton(s)
                                        </span>
                                        <span>•</span>
                                        <span class="text-slate-400">${itemsCount} article(s)</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Right Controls -->
                            <div class="flex items-center space-x-2" onclick="event.stopPropagation()">
                                <button onclick="printSlip('${esc(exp.id)}')" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 text-xs font-bold transition flex items-center space-x-1.5" title="Imprimer le bon de livraison">
                                    <i class="fa-solid fa-print"></i>
                                    <span class="hidden sm:inline">Imprimer BL</span>
                                </button>
                                
                                <button onclick="editExp('${esc(exp.id)}')" class="op-only p-2 rounded-xl bg-slate-800 hover:bg-amber-950/60 hover:text-amber-300 text-slate-300 border border-slate-700 transition" title="Modifier cette journée">
                                    <i class="fa-solid fa-pen-to-square text-xs"></i>
                                </button>

                                <button onclick="deleteExp('${esc(exp.id)}')" class="op-only p-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 text-slate-400 border border-slate-700 transition" title="Supprimer">
                                    <i class="fa-regular fa-trash-can text-xs"></i>
                                </button>

                                <div class="w-8 h-8 rounded-xl bg-slate-800/60 flex items-center justify-center text-slate-400 ml-1">
                                    <i id="icon-${esc(exp.id)}" class="fa-solid fa-chevron-down text-xs transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}"></i>
                                </div>
                            </div>

                        </div>

                        <!-- Accordion Expandable Content -->
                        <div id="content-${esc(exp.id)}" class="${isExpanded ? '' : 'hidden'} border-t border-slate-800">
                            
                            <!-- Observations note banner -->
                            ${exp.observations ? `
                                <div class="px-5 py-2.5 bg-indigo-950/30 border-b border-indigo-900/30 flex items-center space-x-2 text-xs text-indigo-300">
                                    <i class="fa-solid fa-circle-info text-indigo-400"></i>
                                    <span>${esc(exp.observations)}</span>
                                </div>
                            ` : ''}

                            <!-- Nested Items Table -->
                            <div class="overflow-x-auto">
                                <table class="w-full text-left text-xs">
                                    <thead>
                                        <tr class="bg-slate-950/60 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                                            <th class="p-3 pl-5">Référence</th>
                                            <th class="p-3">Désignation</th>
                                            <th class="p-3">Destinataire</th>
                                            <th class="p-3 text-center">Unité</th>
                                            <th class="p-3 text-right">Quantité</th>
                                            <th class="p-3 text-center">Nombre Cartons</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-slate-800/40">
                                        ${(exp.items || []).map(it => `
                                            <tr class="hover:bg-slate-800/40 transition">
                                                <td class="p-3 pl-5 font-mono-code font-bold text-indigo-400">${esc(it.reference || '-')}</td>
                                                <td class="p-3 font-semibold text-slate-200">${esc(it.designation || '-')}</td>
                                                <td class="p-3">
                                                    <span class="inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${it.destinataire === 'STOCK' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}">
                                                        ${esc(it.destinataire || 'STOCK')}
                                                    </span>
                                                </td>
                                                <td class="p-3 text-center text-slate-400 font-mono-code">${esc(it.unite || 'UN')}</td>
                                                <td class="p-3 text-right font-mono-code font-bold text-slate-100">${formatDigits(it.quantite)}</td>
                                                <td class="p-3 text-center font-bold text-amber-400">${esc(it.cartons || '1')}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>

                        </div>

                    </div>
                `;
            }).join('');
        }

        // Render Flat Table
        function renderTableView(data) {
            const tbody = document.getElementById('flatTableBody');
            let rowsHtml = '';

            data.forEach(exp => {
                (exp.items || []).forEach(it => {
                    rowsHtml += `
                        <tr class="hover:bg-slate-800/40 transition">
                            <td class="p-3.5 pl-5 font-bold text-white whitespace-nowrap">${esc(exp.date_envoi)}</td>
                            <td class="p-3.5 font-mono-code text-indigo-300 text-xs">${esc(exp.numero_bl || '-')}</td>
                            <td class="p-3.5 font-semibold text-slate-300">${esc(exp.transporteur)}</td>
                            <td class="p-3.5 font-mono-code font-bold text-indigo-400">${esc(it.reference || '-')}</td>
                            <td class="p-3.5 text-slate-200 font-medium">${esc(it.designation || '-')}</td>
                            <td class="p-3.5">
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${it.destinataire === 'STOCK' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'}">
                                    ${esc(it.destinataire || 'STOCK')}
                                </span>
                            </td>
                            <td class="p-3.5 text-center text-slate-400">${esc(it.unite || 'UN')}</td>
                            <td class="p-3.5 text-right font-mono-code font-bold text-slate-100">${formatDigits(it.quantite)}</td>
                            <td class="p-3.5 text-center font-bold text-amber-400">${esc(it.cartons || '1')}</td>
                            <td class="p-3.5 text-slate-400 text-xs truncate max-w-xs">${esc(exp.observations || '-')}</td>
                        </tr>
                    `;
                });
            });

            tbody.innerHTML = rowsHtml || `<tr><td colspan="10" class="p-8 text-center text-slate-500">Aucune expédition enregistrée</td></tr>`;
        }

        // Toggle Accordion Item
        function toggleAccordion(contentId, iconId) {
            const content = document.getElementById(contentId);
            const icon = document.getElementById(iconId);
            if (content.classList.contains('hidden')) {
                content.classList.remove('hidden');
                if (icon) icon.classList.add('rotate-180');
            } else {
                content.classList.add('hidden');
                if (icon) icon.classList.remove('rotate-180');
            }
        }

        function toggleAllAccordions() {
            allAccordionsExpanded = !allAccordionsExpanded;
            applyFilters();
            showToast(allAccordionsExpanded ? "Toutes les dates dépliées" : "Toutes les dates repliées", "info");
        }

        // Switch View (Par Date vs Table)
        function switchView(view) {
            currentView = view;
            const dateCont = document.getElementById('dateViewContainer');
            const tableCont = document.getElementById('tableViewContainer');
            const btnDate = document.getElementById('viewBtnDate');
            const btnTable = document.getElementById('viewBtnTable');

            if (view === 'date') {
                dateCont.classList.remove('hidden');
                tableCont.classList.add('hidden');
                btnDate.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 bg-indigo-600 text-white shadow-md shadow-indigo-600/30";
                btnTable.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all flex items-center space-x-2";
            } else {
                dateCont.classList.add('hidden');
                tableCont.classList.remove('hidden');
                btnTable.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 bg-indigo-600 text-white shadow-md shadow-indigo-600/30";
                btnDate.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all flex items-center space-x-2";
            }
        }

        // Modal: Nouvelle Expédition Form Handlers
        function openNewExpeditionModal() {
            if (!requireOperator()) return;
            document.getElementById('formExpeditionId').value = '';
            document.getElementById('expeditionModalTitle').textContent = "Nouvel envoi de marchandises";
            document.getElementById('formDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('formNumeroBL').value = nextBL(document.getElementById('formDate').value);
            document.getElementById('formCarrier').value = 'YAZID';
            document.getElementById('formObservations').value = '';

            document.getElementById('itemsTableBody').innerHTML = '';
            addNewItemRow();

            showModal('expeditionModal');
        }

        function closeExpeditionModal() {
            hideModal('expeditionModal');
        }

        function addNewItemRow(item = null) {
            const tbody = document.getElementById('itemsTableBody');
            const rowId = 'row_' + Math.random().toString(36).substring(2, 9);
            const tr = document.createElement('tr');
            tr.id = rowId;
            tr.className = "hover:bg-slate-900 transition";

            tr.innerHTML = `
                <td class="p-2">
                    <input type="text" list="productsList" value="${esc(item ? item.reference : '')}" placeholder="Réf (ex: E02CL38B1)" class="row-ref w-full px-2.5 py-1.5 bg-slate-900 border border-slate-750 text-indigo-300 rounded-lg text-xs font-mono-code focus:outline-none focus:ring-1 focus:ring-indigo-500">
                </td>
                <td class="p-2">
                    <input type="text" value="${esc(item ? item.designation : '')}" placeholder="Désignation marchandise" class="row-des w-full px-2.5 py-1.5 bg-slate-900 border border-slate-750 text-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500">
                </td>
                <td class="p-2">
                    <input type="text" list="clientsList" value="${esc(item ? item.destinataire : 'STOCK')}" placeholder="Client ou STOCK" class="row-dest w-full px-2.5 py-1.5 bg-slate-900 border border-slate-750 text-white rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500">
                </td>
                <td class="p-2 text-center">
                    <select class="row-unit w-full px-1 py-1.5 bg-slate-900 border border-slate-750 text-slate-300 rounded-lg text-xs text-center focus:outline-none">
                        <option value="UN" ${item && item.unite === 'UN' ? 'selected' : ''}>UN</option>
                        <option value="ID" ${item && item.unite === 'ID' ? 'selected' : ''}>ID</option>
                        <option value="BOBINE" ${item && item.unite === 'BOBINE' ? 'selected' : ''}>BOBINE</option>
                    </select>
                </td>
                <td class="p-2 text-right">
                    <input type="text" value="${esc(item ? item.quantite : '100')}" placeholder="0" class="row-qte w-full px-2.5 py-1.5 bg-slate-900 border border-slate-750 text-slate-100 rounded-lg text-xs text-right font-mono-code font-bold focus:outline-none">
                </td>
                <td class="p-2 text-center">
                    <input type="number" min="1" value="${esc(item ? item.cartons : '1')}" oninput="updateModalTotals()" class="row-cartons w-full px-1 py-1.5 bg-slate-900 border border-slate-750 text-amber-400 rounded-lg text-xs text-center font-bold focus:outline-none">
                </td>
                <td class="p-2 text-center">
                    <button type="button" onclick="removeRow('${rowId}')" class="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition" title="Supprimer la ligne">
                        <i class="fa-solid fa-xmark text-xs"></i>
                    </button>
                </td>
            `;

            tbody.appendChild(tr);
            updateModalTotals();
        }

        function removeRow(rowId) {
            const el = document.getElementById(rowId);
            if (el) el.remove();
            updateModalTotals();
        }

        function updateModalTotals() {
            const cartons = document.querySelectorAll('.row-cartons');
            let total = 0;
            cartons.forEach(c => total += parseInt(c.value) || 1);
            document.getElementById('modalTotalCartons').textContent = `Total Cartons : ${total}`;
            document.getElementById('modalItemsCounter').textContent = `${cartons.length} article(s)`;
        }

        // Save Expedition (Supabase + Local)
        async function saveExpedition() {
            if (!requireOperator()) return;
            const expId = document.getElementById('formExpeditionId').value;
            const dateVal = document.getElementById('formDate').value;
            const blVal = document.getElementById('formNumeroBL').value;
            const carrierVal = document.getElementById('formCarrier').value;
            const obsVal = document.getElementById('formObservations').value;

            if (!dateVal) {
                showToast("Veuillez choisir une date d'expédition valide.", "error");
                return;
            }

            const rows = document.querySelectorAll('#itemsTableBody tr');
            const items = [];
            rows.forEach(tr => {
                const ref = tr.querySelector('.row-ref').value.trim();
                const des = tr.querySelector('.row-des').value.trim();
                const dest = tr.querySelector('.row-dest').value.trim();
                const unit = tr.querySelector('.row-unit').value;
                const qte = tr.querySelector('.row-qte').value.trim();
                const cartons = tr.querySelector('.row-cartons').value.trim();

                if (ref || des || dest) {
                    items.push({
                        id: 'item_' + Math.random().toString(36).substring(2, 9),
                        reference: ref,
                        designation: des,
                        destinataire: dest || 'STOCK',
                        unite: unit || 'UN',
                        quantite: qte || '0',
                        cartons: cartons || '1'
                    });
                }
            });

            if (items.length === 0) {
                showToast("Veuillez renseigner au moins un article.", "error");
                return;
            }

            const record = {
                id: expId || ('exp_' + Date.now()),
                date_envoi: dateVal,
                numero_bl: blVal,
                transporteur: carrierVal,
                observations: obsVal,
                statut: 'Expédié',
                items: items
            };

            try {
                const upsertData = { date_envoi: dateVal, numero_bl: blVal, transporteur: carrierVal, observations: obsVal, statut: 'Expédié' };
                if (UUID_RE.test(record.id)) upsertData.id = record.id;
                const { data: expRow, error: eErr } = await supabaseClient.from('expeditions').upsert(upsertData).select().single();
                if (eErr) throw eErr;
                record.id = expRow.id;
                const { error: dErr } = await supabaseClient.from('lignes_expedition').delete().eq('expedition_id', expRow.id);
                if (dErr) throw dErr;
                const { error: iErr } = await supabaseClient.from('lignes_expedition').insert(items.map(it => ({
                    expedition_id: expRow.id, reference: it.reference, designation: it.designation,
                    destinataire: it.destinataire, unite: it.unite, quantite: it.quantite, cartons: it.cartons
                })));
                if (iErr) throw iErr;
                showToast("Envoi enregistré.", "success");
            } catch (err) {
                console.error(err);
                showToast("Échec de l'enregistrement : " + explain(err), "error");
                await fetchData();
                return;
            }

            // Update in-memory and local storage
            if (expId) {
                const idx = allExpeditions.findIndex(e => e.id === expId);
                if (idx !== -1) allExpeditions[idx] = record;
            } else {
                allExpeditions.unshift(record);
            }

            saveToLocalStorage();
            closeExpeditionModal();
            fillFilterOptions();
            const ys = document.getElementById('filterYear');
            if (ys.value !== 'all' && ys.value !== dateVal.slice(0, 4)) ys.value = 'all';
            applyFilters();
            updateKPIs();
        }

        // Edit
        function editExp(id) {
            if (!requireOperator()) return;
            const exp = allExpeditions.find(e => e.id === id);
            if (!exp) return;

            document.getElementById('formExpeditionId').value = exp.id;
            document.getElementById('expeditionModalTitle').textContent = "Modifier l'Envoi du " + exp.date_envoi;
            document.getElementById('formDate').value = exp.date_envoi;
            document.getElementById('formNumeroBL').value = exp.numero_bl || '';
            document.getElementById('formCarrier').value = exp.transporteur || 'YAZID';
            document.getElementById('formObservations').value = exp.observations || '';

            const tbody = document.getElementById('itemsTableBody');
            tbody.innerHTML = '';
            (exp.items || []).forEach(it => addNewItemRow(it));

            showModal('expeditionModal');
        }

        // Delete
        async function deleteExp(id) {
            if (!requireOperator()) return;
            if (!confirm("Voulez-vous vraiment supprimer cet envoi et l'ensemble de ses colis ?")) return;
            try {
                if (UUID_RE.test(id)) {
                    const r1 = await supabaseClient.from('lignes_expedition').delete().eq('expedition_id', id);
                    if (r1.error) throw r1.error;
                    const r2 = await supabaseClient.from('expeditions').delete().eq('id', id);
                    if (r2.error) throw r2.error;
                }
            } catch (e) {
                showToast("Suppression impossible : " + explain(e), "error");
                return;
            }
            allExpeditions = allExpeditions.filter(e => e.id !== id);
            saveToLocalStorage();
            fillFilterOptions();
            applyFilters();
            showToast("Envoi supprimé.", "success");
        }

        // Print Slip
        function printSlip(id) {
            const exp = allExpeditions.find(e => e.id === id);
            if (!exp) return;

            document.getElementById('printBL').textContent = exp.numero_bl || 'BL';
            document.getElementById('printDate').textContent = 'Date: ' + exp.date_envoi;
            document.getElementById('printCarrier').textContent = 'Transporteur: ' + exp.transporteur;
            document.getElementById('printObs').textContent = exp.observations ? 'Note: ' + exp.observations : '';

            let totalCartons = 0;
            const tbody = document.getElementById('printTableBody');
            tbody.innerHTML = (exp.items || []).map(it => {
                const cNum = parseInt(it.cartons) || 1;
                totalCartons += cNum;
                return `
                    <tr style="border: 1px solid #cbd5e1;">
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold;">${esc(it.reference || '-')}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${esc(it.designation || '-')}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: bold;">${esc(it.destinataire || 'STOCK')}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center;">${esc(it.unite || 'UN')}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${formatDigits(it.quantite)}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${esc(it.cartons || '1')}</td>
                    </tr>
                `;
            }).join('');

            document.getElementById('printTotalCartons').textContent = totalCartons;

            const printArea = document.getElementById('printArea');
            printArea.classList.remove('hidden');
            window.print();
            printArea.classList.add('hidden');
        }

        // Export to CSV
        function exportToCSV() {
            let csv = '\uFEFF';
            csv += 'Date;Bordereau;Transporteur;Reference;Designation;Destinataire;Unite;Quantite;Cartons;Observations\n';

            allExpeditions.forEach(exp => {
                (exp.items || []).forEach(it => {
                    const row = [
                        exp.date_envoi,
                        exp.numero_bl || '',
                        exp.transporteur || '',
                        it.reference || '',
                        it.designation || '',
                        it.destinataire || '',
                        it.unite || 'UN',
                        it.quantite || '0',
                        it.cartons || '1',
                        (exp.observations || '').replace(/;/g, ',')
                    ];
                    csv += row.join(';') + '\n';
                });
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Expeditions_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
            showToast("Fichier Excel exporté avec succès !", "success");
        }

        // Admin & Config modal
        function openAdminModal() {
            showModal('adminModal');
        }

        function closeAdminModal() {
            hideModal('adminModal');
        }

        function toggleKeyVis() {
            const inp = document.getElementById('supabaseKeyInput');
            inp.type = inp.type === 'password' ? 'text' : 'password';
        }

        function saveAdminSupabase() {
            if (!requireOperator()) return;
            const url = document.getElementById('supabaseUrlInput').value.trim();
            const key = document.getElementById('supabaseKeyInput').value.trim();

            if (!url || !key) {
                showToast("Veuillez renseigner l'URL et la clé.", "error");
                return;
            }

            localStorage.setItem('supabase_url', url);
            localStorage.setItem('supabase_key', key);
            initSupabase();
            initAuth();
            fetchData();
            showToast("Paramètres Supabase enregistrés !", "success");
            closeAdminModal();
        }

        async function loadSample2027Data() {
            if (!requireOperator()) return;
            if (!confirm("Charger 3 envois d'exemple dans la base ?")) return;
            try {
                for (const smp of defaultSamples2027) {
                    const { data: expRow, error } = await supabaseClient.from('expeditions').insert({
                        date_envoi: smp.date_envoi, numero_bl: smp.numero_bl, transporteur: smp.transporteur,
                        observations: smp.observations, statut: smp.statut
                    }).select().single();
                    if (error) throw error;
                    const { error: lErr } = await supabaseClient.from('lignes_expedition').insert(smp.items.map(it => ({
                        expedition_id: expRow.id, reference: it.reference, designation: it.designation,
                        destinataire: it.destinataire, unite: it.unite, quantite: it.quantite, cartons: it.cartons
                    })));
                    if (lErr) throw lErr;
                }
                showToast("Exemples ajoutés.", "success");
                await fetchData();
                closeAdminModal();
            } catch (e) {
                showToast("Échec : " + explain(e), "error");
            }
        }

        async function manualSync() {
            const btn = document.getElementById('syncBtn');
            btn.classList.add('animate-spin');
            await fetchData();
            setTimeout(() => {
                btn.classList.remove('animate-spin');
                showToast("Synchronisation terminée !", "success");
            }, 600);
        }

        function resetFilters() {
            document.getElementById('searchInput').value = '';
            document.getElementById('filterYear').value = 'all';
            document.getElementById('filterCarrier').value = 'all';
            document.getElementById('filterDest').value = 'all';
            applyFilters();
        }

        // Modal open/close animation helpers
        function showModal(id) {
            const modal = document.getElementById(id);
            modal.style.display = 'flex';
            setTimeout(() => {
                modal.classList.remove('modal-hidden');
            }, 10);
        }

        function hideModal(id) {
            const modal = document.getElementById(id);
            modal.classList.add('modal-hidden');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 260);
        }

        // Toast notifications
        function showToast(message, type = 'info') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            
            let bgClass = "bg-slate-900 border-slate-750 text-white";
            let icon = "fa-circle-info text-indigo-400";
            if (type === 'success') {
                bgClass = "bg-slate-900 border-emerald-500/50 text-emerald-300";
                icon = "fa-circle-check text-emerald-400";
            } else if (type === 'error') {
                bgClass = "bg-slate-900 border-rose-500/50 text-rose-300";
                icon = "fa-circle-exclamation text-rose-400";
            } else if (type === 'warning') {
                bgClass = "bg-slate-900 border-amber-500/50 text-amber-300";
                icon = "fa-triangle-exclamation text-amber-400";
            }

            toast.className = `pointer-events-auto flex items-center space-x-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl text-xs font-semibold transform transition-all duration-300 translate-y-4 opacity-0 ${bgClass}`;
            toast.innerHTML = `
                <i class="fa-solid ${icon} text-sm"></i>
                <span>${esc(message)}</span>
            `;

            container.appendChild(toast);
            setTimeout(() => {
                toast.classList.remove('translate-y-4', 'opacity-0');
            }, 10);

            setTimeout(() => {
                toast.classList.add('translate-y-4', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3500);
        }

        // Date formatters
        function formatDayName(dStr) {
            try {
                const d = new Date(dStr + 'T00:00:00');
                return d.toLocaleDateString('fr-FR', { weekday: 'short' });
            } catch { return 'J'; }
        }

        function formatDayNumber(dStr) {
            try {
                const parts = dStr.split('-');
                return parts[2] + '/' + parts[1];
            } catch { return dStr; }
        }

        function formatDigits(num) {
            if (!num) return '0';
            return esc(num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "));
        }
