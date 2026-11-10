/* Lecture complète des tables, avec un ordre stable par identifiant. */
async function readLogiTrakRows(client, table, columns = '*') {
  const rows = [];
  const size = 500;
  for (let offset = 0;; offset += size) {
    const { data, error } = await client.from(table).select(columns).order('id').range(offset, offset + size - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < size) return rows;
  }
}

function attachLogiTrakItems(expeditions, lines) {
  const byExpedition = new Map();
  for (const line of lines) {
    if (!byExpedition.has(line.expedition_id)) byExpedition.set(line.expedition_id, []);
    byExpedition.get(line.expedition_id).push(line);
  }
  return expeditions.sort((a, b) => String(b.date_envoi || '').localeCompare(String(a.date_envoi || '')) ||
    String(b.created_at || '').localeCompare(String(a.created_at || ''))).map(expedition => ({
    ...expedition,
    items: (byExpedition.get(expedition.id) || []).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))),
  }));
}
