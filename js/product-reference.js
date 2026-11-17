window.productReference = function(ref, category) {
  const code=String(ref||'').trim().toUpperCase();
  const cat=LTColis.categoryId(category);
  const pvc=/^PVC(?:-?([A-Z][A-Z0-9]*?))?-(\d+)(-AC)?$/.exec(code);
  const labels=[];
  const rfid=cat==='RFID'||Boolean(pvc?.[1]);
  const packet=pvc&&Number(pvc[2])>0&&Number(pvc[2])<=2147483647?Number(pvc[2]):null;
  if(rfid) labels.push('RFID');
  if((cat==='ETQ'||cat==='RFID')&&/-P\d+$/i.test(code)) labels.push('Étiquette imprimée');
  if(cat==='RUBAN'&&code) labels.push(code.endsWith('-IN')?'INK IN':'INK OUT',code.startsWith('RN')?'Near Edge':'Flat Head');
  if(pvc?.[3]) labels.push('Carte PVC adhésive');
  if(packet) labels.push(packet+' cartes par paquet');
  return {rfid,packet,labels};
};

window.renderReferenceBadges = function(container, traits) {
  const badges = traits.labels.map(label => {
    const [icon, background, color] =
      label === 'RFID' ? ['fa-tower-broadcast','#fee2e2','#991b1b'] :
      label.startsWith('INK') ? ['fa-droplet','#fef3c7','#92400e'] :
      label === 'Near Edge' || label === 'Flat Head' ? ['fa-print','#dbeafe','#1e40af'] :
      label.endsWith('cartes par paquet') ? ['fa-box','#dcfce7','#166534'] :
      label.startsWith('Carte') ? ['fa-credit-card','#ede9fe','#5b21b6'] :
      ['fa-tag','#dbeafe','#1e40af'];
    const badge=document.createElement('span');
    badge.className='badge';
    badge.style.cssText='background:'+background+';color:'+color+';border-color:'+color;
    badge.title=label;
    badge.setAttribute('role','img');
    badge.setAttribute('aria-label',label);
    const glyph=document.createElement('i');
    glyph.className='fa-solid '+icon;
    glyph.setAttribute('aria-hidden','true');
    badge.append(glyph);
    if(label.startsWith('INK') || label === 'Near Edge' || label === 'Flat Head' || label.endsWith('cartes par paquet')) {
      badge.append(' '+(label.endsWith('cartes par paquet')?label.split(' ')[0]:label==='Near Edge'?'NE':label==='Flat Head'?'FH':label.slice(4)));
    }
    return badge;
  });
  container.replaceChildren(...badges);
};
