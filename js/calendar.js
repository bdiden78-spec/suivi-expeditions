/* Date civile de l'usine, au format comparable aux colonnes date de Supabase. */
const logitrakCalendar = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit',
});

function logitrakToday(now = new Date()) {
  const parts = Object.fromEntries(logitrakCalendar.formatToParts(now).map(part => [part.type, part.value]));
  return parts.year + '-' + parts.month + '-' + parts.day;
}
