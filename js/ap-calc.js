/* Quantités en ID, indépendantes du nombre d'exemplaires de l'étiquette. */
window.APcalc = {
  packing(quantity) {
    const full = Math.floor(quantity / 1000), partial = quantity % 1000;
    return { full, partial, packages: full + (partial ? 1 : 0) };
  },
  packingText(quantity) {
    const { full, partial, packages } = this.packing(quantity);
    const parts = [];
    if (full) parts.push(full.toLocaleString('fr-FR') + ' paquet(s) de 1 000 ID');
    if (partial) parts.push('1 paquet de ' + partial.toLocaleString('fr-FR') + ' ID');
    return parts.length ? parts.join(' + ') + ' · ' + packages.toLocaleString('fr-FR') + ' paquet(s)' : 'Aucune impression';
  },
  numericRange(first, last) {
    const start = first.replace(/\s/g, ''), end = last.replace(/\s/g, '');
    if (!/^[0-9]+$/.test(start) || !/^[0-9]+$/.test(end)) return null;
    if (start.length > 40 || end.length > 40) return { error: 'Numéro trop long (40 chiffres maximum).' };
    return { quantity: BigInt(end) - BigInt(start) + 1n };
  },
  rangeError(first, last, quantity) {
    if (!Number.isSafeInteger(quantity) || quantity < 1) return 'Saisissez une quantité entière positive.';
    if (!first || !last) return 'Renseignez le premier et le dernier numéro.';
    const range = this.numericRange(first, last);
    if (range?.error) return range.error;
    if (range && range.quantity !== BigInt(quantity)) {
      return range.quantity > 0n
        ? 'La plage inclusive contient ' + range.quantity.toLocaleString('fr-FR') + ' ID. Vérifiez la quantité imprimée.'
        : 'Le dernier numéro doit être supérieur ou égal au premier.';
    }
    return '';
  },
};
