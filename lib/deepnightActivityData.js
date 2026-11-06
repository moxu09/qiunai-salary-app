import { fetchAllRows } from "./fetchAllRows.js";

export async function activityRows(query) {
  const { data, error } = await fetchAllRows(query);
  if (error) throw error;
  return data;
}

export async function relatedActivityRows(db, table, column, ids, fields = "*", order = "id", discordId = null) {
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    let query = db.from(table).select(fields).in(column, ids.slice(offset, offset + 100)).order(order);
    if (discordId) query = query.eq("discord_id", discordId);
    rows.push(...await activityRows(query));
  }
  return rows;
}
