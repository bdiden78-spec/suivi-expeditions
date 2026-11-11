window.APtrace = {
  completed(run) { return !run.statut || run.statut === 'TERMINE'; },
  quantity(run) { return this.completed(run) ? Number(run.quantite_imprimee || 0) : Number(run.quantite_prevue || 0); },
  timestamp(value) {
    return value ? new Intl.DateTimeFormat('fr-FR', {timeZone:'Africa/Algiers',dateStyle:'short',timeStyle:'short'}).format(new Date(value)) : 'Non renseigné';
  },
  containsIdentifier(run, value) {
    const query = String(value || '').replace(/\s/g,'').toUpperCase();
    if (!query) return true;
    const first = String(run.numero_debut || '').replace(/\s/g,'').toUpperCase();
    const last = String(run.numero_fin || '').replace(/\s/g,'').toUpperCase();
    if (/^[0-9]+$/.test(query) && /^[0-9]+$/.test(first) && /^[0-9]+$/.test(last)) {
      return BigInt(first) <= BigInt(query) && BigInt(query) <= BigInt(last);
    }
    return query === first || query === last;
  },
  matches(event, filters) {
    const states = [event.avant,event.apres].filter(Boolean);
    const query = String(filters.search || '').trim().toLocaleLowerCase('fr');
    return states.some(state => (!filters.machine || state.imprimante === filters.machine) &&
      (!filters.status || (state.statut || 'TERMINE') === filters.status) && this.containsIdentifier(state,filters.identifier) &&
      (!query || [event.auteur,event.commande?.client,event.commande?.sous_categorie,event.production_id,
        state.imprimante,state.created_by,state.termine_par,state.numero_debut,state.numero_fin].join(' ').toLocaleLowerCase('fr').includes(query)));
  },
};
