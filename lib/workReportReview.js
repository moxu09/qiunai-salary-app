import "server-only";

function manualRate(tier) { return { rate_80: 80, rate_85: 85, rate_90: 90, manager_95: 95 }[tier] || null; }
function parseMeta(row) { try { return JSON.parse(row.admin_note || "{}"); } catch { return {}; } }

export async function reviewWorkReport(supabaseAdmin, _organization, body, reviewerDiscordId) {
  const id = String(body.id || "").trim();
  const action = String(body.action || "");
  if (!id || !["approve", "reject"].includes(action)) throw new Error("審核資料不正確");
  const { data: row, error: readError } = await supabaseAdmin.from("qiunai_salary_orders").select("*").eq("id", id).eq("status", "工時待審核").single();
  if (readError || !row) throw new Error("找不到待審核的訂單或打賞");
  if (action === "reject") {
    const reason = String(body.reason || "").trim();
    if (!reason) throw new Error("請輸入駁回原因");
    const { error } = await supabaseAdmin.from("qiunai_salary_orders").update({ status: "工時已駁回", deleted_reason: reason, edited_at: new Date().toISOString(), edited_by: reviewerDiscordId }).eq("id", id).eq("status", "工時待審核");
    if (error) throw error;
    return { id, action };
  }
  const meta = parseMeta(row);
  const staffId = String(row.discord_id || "").trim();
  const { data: staff, error: staffError } = await supabaseAdmin.from("qiunai_staff").select("discord_id, commission_tier").eq("discord_id", staffId).single();
  if (staffError || !staff) throw new Error("找不到員工抽成設定");
  const endedAt = meta.endedAt || row.order_finished_at || new Date().toISOString();
  const serviceName = meta.serviceName || row.service_name || "陪玩服務";
  const orderType = meta.orderType || "訂單";
  const isTip = String(orderType).includes("打賞") || String(serviceName).includes("打賞");
  const regularRate = manualRate(staff.commission_tier) || (new Date(endedAt) < new Date("2026-09-01T00:00:00+08:00") ? 90 : 80);
  const salaryRate = isTip && regularRate !== 95 ? 90 : regularRate;
  const amount = Number(row.order_amount || row.final_price || row.price || 0);
  const staffSalary = Math.round(amount * salaryRate / 100);
  const { error } = await supabaseAdmin.from("qiunai_salary_orders").update({
    customer_name: meta.customerName || row.customer_name || row.customer_id || "手動報單",
    service_name: serviceName, order_amount: amount, staff_salary: staffSalary, bonus_amount: 0,
    salary_rate: salaryRate, salary_level: isTip ? (salaryRate === 95 ? "打賞特別設定 95%" : "打賞固定 90%") : `工時申報 ${salaryRate}%`,
    platform_income: amount, platform_expense: staffSalary, status: "未發薪", order_finished_at: endedAt,
    admin_note: `申報時長 ${Number(meta.durationMinutes || row.duration_minutes || 0)} 分鐘｜審核人 ${reviewerDiscordId}`, is_deleted: false,
  }).eq("id", id).eq("status", "工時待審核");
  if (error) throw error;
  return { id, action, salaryRate, staffSalary };
}
