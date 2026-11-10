/* ==========================================================
   LogiTrak v21 — Règles communes (utilisées par TOUTES les pages)

   1) CALCUL DES CARTONS (nombres entiers, jamais de virgule)
      - Cartons pleins : quantité ÷ capacité du carton (ex. 9 bobines par H2).
      - RELIQUAT (bobines qui ne remplissent pas un carton) : c'est l'OPÉRATEUR qui décide
          · « CARTON » : le reliquat est mis dans un carton (H1 ou H2 au choix) ;
          · « STOCK »  : le reliquat reste en stock et part plus tard dans un CARTON MIXTE
                         (plusieurs références dans un même carton).
   2) POIDS : carton vide H1 = 0,420 kg ; H2 = 0,465 kg. Poids d'un carton = carton vide + bobines × poids d'une bobine.
      Un carton ne doit pas dépasser 15 kg.
   3) CATÉGORIES (statistiques) : classement sur la catégorie du produit uniquement.
   ========================================================== */
(function (root) {
  'use strict';

  const toInt = v => parseInt(String(v == null ? '' : v).replace(/[^0-9]/g, ''), 10) || 0;
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; };
  const round3 = n => Math.round(n * 1000) / 1000;
  const up = v => String(v == null ? '' : v).trim().toUpperCase();

  /* ---------- Poids des cartons ---------- */
  const TARE = { H1: 0.420, H2: 0.465 };          // poids du carton vide (kg)
  const MAX_CARTON_KG = 15;                        // un carton ne doit pas dépasser 15 kg
  const tareOf = type => TARE[up(type)] || 0;

  // Poids d'un carton contenant `n` bobines (ou unités / paquets)
  function boxWeight(type, n, lot) {
    const t = tareOf(type) || num(lot && lot.poids_carton_vide);
    const unit = num(lot && lot.poids_bobine);
    if (unit > 0) return round3(t + toInt(n) * unit);
    // ancien lot sans poids de bobine : on prend le poids du carton plein, au prorata
    const full = num(lot && lot.poids_carton), qpc = toInt(lot && lot.qte_par_carton) || 1;
    return full > 0 ? round3(full * toInt(n) / qpc) : round3(t);
  }

  /* ---------- Reliquat ---------- */
  const remainderOf = lot => {
    const qpc = toInt(lot && lot.qte_par_carton) || 1;
    return toInt(lot && lot.quantite_produite) % qpc;
  };
  // Un lot dont le colisage est validé et qui a un reliquat doit avoir une décision de l'opérateur
  const needsDecision = lot => !!(lot && lot.colisage_valide && remainderOf(lot) > 0 && !up(lot.reliquat_mode));

  // Suggestion (modifiable) : petit reliquat -> H1 si le carton principal est un H2
  function suggestCarton(rem, qpc, mainType, types) {
    const list = (types || []).map(up);
    if (up(mainType) === 'H2' && list.includes('H1') && rem <= Math.floor(qpc / 2)) return 'H1';
    return up(mainType) || 'H2';
  }

  // Quantités expédiables d'un lot
  //   shippedNormal : quantité déjà expédiée en cartons ; shippedMixte : déjà expédiée en carton mixte
  function partialAvailable(lot, shippedNormal, shippedMixte) {
    const quantity = toInt(lot.quantite_produite), remainder = remainderOf(lot);
    return Math.max(0, remainder - toInt(shippedMixte) - Math.max(0, toInt(shippedNormal) - (quantity - remainder)));
  }

  function unitWeight(lot) {
    const tare = num(lot.poids_carton_vide) || tareOf(lot.type_carton);
    return num(lot.poids_bobine) || Math.max(0, num(lot.poids_carton) - tare) / (toInt(lot.qte_par_carton) || 1);
  }

  function availability(lot, shippedNormal, shippedMixte, reservedStock = 0) {
    const Q = toInt(lot.quantite_produite), R = remainderOf(lot), mode = up(lot.reliquat_mode);
    const sn = toInt(shippedNormal), sm = toInt(shippedMixte);
    if (R > 0 && !mode && partialAvailable(lot, sn, sm) > reservedStock) {
      return { blocked: true, normal: 0, mixte: 0, stock: 0 };
    }
    if (mode === 'STOCK' && R > 0) {
      const normal = Math.max(0, Math.min(Q - R - sn, Q - sn - sm - reservedStock));
      const mixte = Math.max(0, partialAvailable(lot, sn, sm) - reservedStock);
      return { blocked: false, normal, mixte, stock: mixte };
    }
    return { blocked: false, normal: Math.max(0, Q - sn - sm - reservedStock), mixte: 0, stock: 0 };
  }

  /* ---------- Cartons d'une quantité donnée ---------- */
  // lot : colonnes de la table production (qte_par_carton, type_carton, reliquat_carton, poids_bobine…)
  function packing(lot, qty) {
    const q = toInt(qty), qpc = toInt(lot && lot.qte_par_carton) || 1;
    if (q < 1) return null;
    const mainType = up(lot.type_carton) || 'H2';
    const full = Math.floor(q / qpc), rem = q % qpc, parts = [];
    if (full > 0) parts.push({ type: mainType, nb: full, qte: qpc, poids: boxWeight(mainType, qpc, lot) });
    if (rem > 0) {
      const t = up(lot.reliquat_carton) || mainType;      // choix de l'opérateur (sinon carton principal)
      parts.push({ type: t, nb: 1, qte: rem, poids: boxWeight(t, rem, lot), partiel: true });
    }
    const total = parts.reduce((s, p) => s + p.nb, 0);
    const kg = round3(parts.reduce((s, p) => s + p.nb * p.poids, 0));
    const heavy = parts.some(p => p.poids > MAX_CARTON_KG);
    return { parts, total, kg, heavy };
  }

  // « 16×H2 (9) + 1×H1 (4) »
  function text(parts) { return (parts || []).map(p => p.nb + '×' + p.type + ' (' + p.qte + ')').join(' + '); }

  // « H2 + H1 »
  function typesText(detail) {
    if (!detail) return '';
    const types = (detail.parts || []).map(p => p.type);
    if (!types.length && detail.type_carton) types.push(up(detail.type_carton));
    if (detail.mixte) return detail.carton_mixte ? 'MIXTE ' + up(detail.carton_mixte) : 'MIXTE';
    return [...new Set(types.filter(Boolean))].join(' + ');
  }

  // Poids d'une ligne d'envoi (détail enregistré avec la ligne)
  function weight(detail, cartonsCount) {
    if (!detail) return 0;
    if (detail.mixte) return round3(toInt(detail.qte) * num(detail.poids_bobine));
    if (detail.parts && detail.parts.length && !detail.manual) return round3(detail.parts.reduce((s, p) => s + p.nb * (p.poids || 0), 0));
    const n = toInt(cartonsCount);
    return n > 0 ? round3(n * boxWeight(detail.type_carton, detail.qpc, { poids_bobine: detail.poids_bobine })) : 0;
  }

  // Poids d'un carton mixte : carton vide (H2 par défaut) + bobines de chaque référence
  function mixedWeight(items, cartonType) {
    return round3(tareOf(cartonType || 'H2') + (items || []).reduce((s, i) => s + toInt(i.qte) * num(i.poids_bobine), 0));
  }

  /* ---------- Catégories (statistiques) ---------- */
  const normSpaced = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

  // Ordre d'affichage. Pour une nouvelle catégorie : ajouter une ligne ici ET dans la liste des catégories (⚙ admin).
  const CATEGORIES = [
    { id: 'ETQ',   label: 'Étiquette',      short: 'Étiquettes',      icon: 'fa-scroll',          c1: '#8b5cf6', c2: '#c084fc' },
    { id: 'RFID',  label: 'Étiquette RFID', short: 'Étiquettes RFID', icon: 'fa-tower-broadcast', c1: '#06b6d4', c2: '#38bdf8' },
    { id: 'RUBAN', label: 'Ruban',          short: 'Rubans',          icon: 'fa-ribbon',          c1: '#10b981', c2: '#34d399' },
    { id: 'PVC',   label: 'Carte PVC',      short: 'Cartes PVC',      icon: 'fa-credit-card',     c1: '#ec4899', c2: '#a855f7', autoHide: true },
    { id: 'TAG',   label: 'Tag',            short: 'Tags',            icon: 'fa-tag',             c1: '#0ea5e9', c2: '#6366f1', autoHide: true },
  ];

  // Reconnaissance sur la CATÉGORIE seulement (jamais sur la désignation ou la référence)
  function categoryId(rawCategory) {
    const s = normSpaced(rawCategory), k = s.replace(/ /g, '');
    if (!k) return null;
    if (k.includes('ALGERIEPOSTE')) return 'AP';           // anciennes données : « ÉTIQUETTE ALGÉRIE POSTE »
    if (k.includes('RFID')) return 'RFID';
    if (k.includes('RUBAN') || /\bRIBBONS?\b/.test(s)) return 'RUBAN';
    if (k.includes('CARTEPVC') || k.includes('CARTESPVC') || /\bPVC\b/.test(s) || /\bCARTES?\b/.test(s)) return 'PVC';
    if (/\bTAGS?\b/.test(s)) return 'TAG';
    if (k.includes('ETIQUETTE')) return 'ETQ';
    return null;
  }

  // Algérie Poste : reconnu sur le DESTINATAIRE (pas sur la désignation, ni la référence)
  function isAlgeriePoste(destinataire) {
    const s = normSpaced(destinataire), k = s.replace(/ /g, '');
    return k.includes('ALGERIEPOSTE') || /\bUPW\b/.test(s);
  }

  const api = { toInt, num, up, TARE, MAX_CARTON_KG, tareOf, boxWeight, remainderOf, needsDecision, suggestCarton, availability, partialAvailable, unitWeight,
                packing, text, typesText, weight, mixedWeight, CATEGORIES, categoryId, isAlgeriePoste, normSpaced };
  root.LTColis = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
