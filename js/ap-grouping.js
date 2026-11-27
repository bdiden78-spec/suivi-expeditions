/* Colisage volontaire de fractions Algérie Poste, LogiTrak 5.2.1. */
window.APGrouping = (() => {
  const normalized = value => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const number = value => String(value || '').replace(/\s/g, '');
  const groupFor = (orderId, groups) => groups.find(group => group.commande_ids.includes(orderId));
  const members = (orderId, groups) => groupFor(orderId, groups)?.commande_ids || [orderId];
  function check(ids, orders, runs, reserved = new Map()) {
    const selected=ids.map(id=>orders.find(order=>order.id===id));
    if(selected.length<2 || selected.some(order=>!order)) return 'Choisissez deux fractions existantes.';
    const first=selected[0];
    if(selected.some(order=>normalized(order.client)!==normalized(first.client)||order.categorie!==first.categorie||order.type_produit!==first.type_produit)) return 'Les fractions doivent avoir la même UPW, la même catégorie et le même type d’identifiant.';
    const dates=selected.map(order=>Date.parse(order.date_commande+'T00:00:00Z'));
    if(dates.some(date=>!Number.isFinite(date)) || Math.max(...dates)-Math.min(...dates)>7*86400000) return 'Les dates de commande doivent être espacées de 7 jours maximum.';
    const available=runs.filter(run=>ids.includes(run.commande_id)&&run.statut==='TERMINE'&&Number(run.quantite_imprimee)>(reserved.get(run.id)||0));
    if(selected.some(order=>!available.some(run=>run.commande_id===order.id))) return 'Chaque fraction doit avoir des paquets validés disponibles en stock.';
    if(available.some(run=>(reserved.get(run.id)||0)>0)) return 'Un tirage est partiellement réservé ou expédié. Terminez son affectation avant de regrouper ces fractions.';
    if(available.some(run=>!/^\d{8}$/.test(number(run.numero_debut))||!/^\d{8}$/.test(number(run.numero_fin))||Number(run.numero_fin.replace(/\s/g,''))-Number(run.numero_debut.replace(/\s/g,''))+1!==Number(run.quantite_imprimee))) return 'Les plages doivent être valides et comporter 8 chiffres.';
    const sorted=[...available].sort((a,b)=>Number(number(a.numero_debut))-Number(number(b.numero_debut)));
    for(let i=1;i<sorted.length;i++)if(Number(number(sorted[i].numero_debut))!==Number(number(sorted[i-1].numero_fin))+1) return 'Les plages disponibles ne sont pas continues : trou ou chevauchement détecté.';
    if(available.some(run=>run.type_carton_ap==='H2')) return 'Rétablissez le colisage H1 des tirages avant ce regroupement.';
    const weights=new Set(available.map(run=>Number(run.poids_paquet_ap??apProductSpec(first.type_produit).packetKg)));
    if(weights.size!==1) return 'Les poids des paquets doivent être identiques.';
    return '';
  }
  async function load(sb) {
    try{return await readLogiTrakRows(sb,'ap_colisage_groupes');}
    catch(error){if(['42P01','PGRST205'].includes(error.code))return [];throw error;}
  }
  return { normalized, number, groupFor, members, check, load };
})();
