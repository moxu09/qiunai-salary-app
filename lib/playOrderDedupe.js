const WORK_REPORT_ORDER_ID = /^WORK-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-\d+$/i;

export function getWorkReportSourceId(orderId) {
  return String(orderId || "").match(WORK_REPORT_ORDER_ID)?.[1] || null;
}

export function filterShadowedSourceOrders(rows = []) {
  const sourceIds = new Set(
    rows
      .filter((row) => row?.is_deleted !== true)
      .map((row) => getWorkReportSourceId(row?.order_id || row?.order_no))
      .filter(Boolean)
  );

  if (sourceIds.size === 0) return rows;
  return rows.filter((row) => !sourceIds.has(String(row?.id || "")));
}
