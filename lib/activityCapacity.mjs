export function parseActivityCapacity(value) {
  if (value == null || value === "") return null;
  const number = typeof value === "string" && /^\d+$/.test(value.trim())
    ? Number(value) : value;
  if (!Number.isInteger(number) || number < 1 || number > 2_147_483_647) {
    throw new Error("活動人數上限須為正整數");
  }
  return number;
}

export async function activityOccupied(db, store, activityId) {
  const { data, error } = await db.rpc("hr_activity_occupied", {
    p_store: store,
    p_activity_id: activityId,
  });
  if (error) throw error;
  return data;
}

export async function checkActivityCapacityEdit(db, store, activityId, capacity) {
  if (capacity != null && await activityOccupied(db, store, activityId) > capacity) {
    throw new Error("人數上限不可低於目前已報名人數");
  }
}
