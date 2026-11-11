window.APproducts = {
  N_RR: { label:'Intérieur · RR — Lettres recommandées', category:'NATIONAL', copies:3 },
  N_CP: { label:'Intérieur · CP — Courriers postaux', category:'NATIONAL', copies:3 },
  N_GC: { label:'Intérieur · GC — Grand Compte', category:'NATIONAL', copies:2 },
  I_RR: { label:'International · RR', category:'INTERNATIONAL', copies:3 },
  I_CP: { label:'International · CP', category:'INTERNATIONAL', copies:3 },
};
function apProductSpec(code) {
  const product = Object.hasOwn(APproducts, code) ? APproducts[code] : null;
  if (!product) return null;
  return { ...product, colors:product.category==='NATIONAL'?'Rouge et vert':'Bleu et jaune',
    reference:product.copies===2?'E02CV25P1':'E02CW25P1',
    format:product.copies===2?'85 × 36':'85 × 54',
    capacity:product.copies===2?20000:14000, packetKg:product.copies===2?0.500:0.750 };
}

function apPackingFields() {
  return '<label class="lbl">Type de carton<select class="inp" name="carton" required></select></label>'+
    '<label class="lbl">Paquets par carton<input class="inp" name="capacity" type="number" min="1" max="2147483" step="1" required></label>'+
    '<label class="lbl">Poids d’un paquet complet (kg)<input class="inp" name="packetKg" type="number" min="0.001" max="100" step="0.001" required></label>';
}
function apPackingSettings(run, spec) {
  return {
    carton:run?.type_carton_ap||'H1',
    capacity:run?.paquets_par_carton_ap??spec.capacity/1000,
    packetKg:Number(run?.poids_paquet_ap??spec.packetKg),
  };
}
function fillAPPackingFields(fields, run, spec) {
  const settings=apPackingSettings(run,spec);
  const types=[...new Set(['H1','H2',...Listes.get('types_carton'),settings.carton])];
  fields.carton.replaceChildren(...types.map(type=>new Option(type,type)));
  fields.carton.value=settings.carton;
  fields.capacity.value=settings.capacity;
  fields.packetKg.value=settings.packetKg;
}
function readAPPackingFields(fields) {
  return {type_carton_ap:fields.carton.value,paquets_par_carton_ap:Number(fields.capacity.value),poids_paquet_ap:Number(fields.packetKg.value)};
}

function apCartons(quantity, spec, run) {
  const settings=apPackingSettings(run,spec);
  const capacity=settings.capacity*1000;
  const tare=LTColis.TARE[settings.carton];
  const full = Math.floor(quantity / capacity);
  const remainder = quantity % capacity;
  return [
    ...(full ? [{count:full, ids:capacity}] : []),
    ...(remainder ? [{count:1, ids:remainder}] : []),
  ].map(group=>({
    ...group,
    packing:APcalc.packingText(group.ids),
    carton:settings.carton, capacity:settings.capacity, packetKg:settings.packetKg,
    netKg:group.ids / 1000 * settings.packetKg,
    grossKg:typeof tare==='number'?group.ids / 1000 * settings.packetKg + tare:null,
  }));
}
