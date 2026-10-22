import "server-only";
import { getMonthlyOrderAmount } from "./creditedSalaryCommission";

function manualRate(tier) { return { rate_80: 80, rate_85: 85, rate_90: 90, manager_95: 95 }[tier] || null; }
function parseMeta(row) { try { return JSON.parse(row.admin_note || "{}"); } catch { return {}; } }

function taipeiYear(dateText) {
  return Number(new Date(new Date(dateText).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 4));
}

async function sumPriorOrders(supabaseAdmin, staffId, column, start, end) {
  let total = 0;
  for (let from = 0; ; from += 1000) {
    let query = supabaseAdmin.from("qiunai_salary_orders")
      .select(column).eq("discord_id", staffId);
    query = column === "staff_salary"
      ? query.eq("is_deleted", false)
      : query.or("is_deleted.eq.false,is_deleted.is.null");
    query = query.gte("order_finished_at", start)
      .lt("order_finished_at", end).order("id", { ascending: true }).range(from, from + 999);
    const { data, error } = await query;
    if (error) throw error;
    for (const order of data || []) total += Number(order[column] || 0);
    if ((data || []).length < 1000) return total;
  }
}

async function getRegularCommission(supabaseAdmin, staff, endedAt) {
  const manual = manualRate(staff.commission_tier);
  let rate = manual;
  if (!rate) {
    if (new Date(endedAt) < new Date("2026-09-01T00:00:00+08:00")) {
      rate = 90;
    } else {
      const year = taipeiYear(endedAt);
      const previousYearSalary = await sumPriorOrders(
        supabaseAdmin, staff.discord_id, "staff_salary",
        new Date(`${year - 1}-01-01T00:00:00+08:00`).toISOString(),
        new Date(`${year}-01-01T00:00:00+08:00`).toISOString(),
      );
      if (previousYearSalary >= 100000) {
        rate = 90;
      } else {
        const previousMonthSalary = await getMonthlyOrderAmount(
          supabaseAdmin, staff.discord_id, endedAt, -1,
        );
        rate = previousMonthSalary >= 10000 ? 85 : 80;
      }
    }
  }
  const { data: activity, error: activityError } = await supabaseAdmin
    .from("salary_activity_commission_settings").select("activity_rate")
    .eq("app_key", "qiunai").lte("starts_at", endedAt).gt("ends_at", endedAt)
    .maybeSingle();
  if (activityError) throw activityError;
  return Math.max(rate, Number(activity?.activity_rate || 0));
}

export async function reviewWorkReport(supabaseAdmin, _organization, body, reviewerDiscordId) {
  const id = String(body.id || "").trim();
  const action = String(body.action || "");
  if (!id || !["approve", "reject"].includes(action)) throw new Error("審核資料不正確");
  const { data: row, error: readError } = await supabaseAdmin.from("qiunai_salary_orders").select("*").eq("id", id).eq("status", "工時待審核").single();
  if (readError || !row) throw new Error("找不到待審核的訂單或打賞");
  if (action === "reject") {
    const reason = String(body.reason || "").trim();
    if (!reason) throw new Error("請輸入駁回原因");
    const { data: changed, error } = await supabaseAdmin.from("qiunai_salary_orders").update({ status: "工時已駁回", deleted_reason: reason, edited_at: new Date().toISOString(), edited_by: reviewerDiscordId }).eq("id", id).eq("status", "工時待審核").select("id").maybeSingle();
    if (error) throw error;
    if (!changed) throw new Error("此筆報單已被其他人審核，請重新整理後確認。");
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
  const regularRate = await getRegularCommission(supabaseAdmin, staff, endedAt);
  const salaryRate = isTip && regularRate !== 95 ? 90 : regularRate;
  const amount = Number(row.order_amount || row.final_price || row.price || 0);
  const staffSalary = Math.round(amount * salaryRate / 100);
  const { data: changed, error } = await supabaseAdmin.from("qiunai_salary_orders").update({
    customer_name: meta.customerName || row.customer_name || row.customer_id || "手動報單",
    service_name: serviceName, order_amount: amount, staff_salary: staffSalary, bonus_amount: 0,
    salary_rate: salaryRate, salary_level: isTip ? (salaryRate === 95 ? "打賞特別設定 95%" : "打賞固定 90%") : `工時申報 ${salaryRate}%`,
    platform_income: amount, platform_expense: staffSalary, status: "未入帳", order_finished_at: endedAt,
    admin_note: `申報時長 ${Number(meta.durationMinutes || row.duration_minutes || 0)} 分鐘｜審核人 ${reviewerDiscordId}`, is_deleted: false,
  }).eq("id", id).eq("status", "工時待審核").select("id").maybeSingle();
  if (error) throw error;
  if (!changed) throw new Error("此筆報單已被其他人審核，請重新整理後確認。");
  return { id, action, salaryRate, staffSalary };
}
