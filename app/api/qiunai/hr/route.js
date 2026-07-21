import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ORG = "qiunai";
const DEPARTMENT = "秋奈電競陪玩";
const ADMIN_TYPES = ["查掛津貼", "代支報銷", "離職申請書", "留職停薪申請書", "逾期補登單申請書", "證照津貼申請書", "過失報告書", "懲處決議書"];
const WELFARE_TYPES = ["生日禮金", "開工紅包", "肉粽補助", "月餅補助", "聖誕補助"];

function friendlyError(error, fallback) {
  const message = String(error?.message || "");
  if (message.includes("schema cache") || message.includes("salary_requests")) {
    return "簽核資料正在初始化，請稍後重新整理；若持續發生請聯繫管理員。";
  }
  return message || fallback;
}

function monthRange(value, offset = 0) {
  const matched = String(value || "").match(/^(\d{4})-(\d{2})$/);
  const base = matched ? new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1 + offset, 1)) : new Date();
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

async function getStaff(discordId) {
  const { data, error } = await supabaseAdmin.from("qiunai_staff").select("discord_id,discord_name,display_name,real_name").eq("discord_id", discordId).maybeSingle();
  if (error || !data) throw new Error("找不到員工資料");
  return data;
}

async function requireAdmin(discordId) {
  const { data } = await supabaseAdmin.from("qiunai_admins").select("discord_id").eq("discord_id", discordId).eq("is_active", true).maybeSingle();
  if (!data) throw new Error("沒有後台管理權限");
}

function approvalCategory(type, group) {
  if (group === "welfare") return "welfare";
  if (type === "代支報銷") return "reimbursement";
  if (type === "留職停薪申請書") return "suspension";
  return "administrative";
}

async function priorMonthSalary(discordId, selectedMonth) {
  const range = monthRange(selectedMonth, -1);
  const [{ data: orders }, { data: bonuses }] = await Promise.all([
    supabaseAdmin.from("qiunai_salary_orders").select("staff_salary").eq("discord_id", discordId).or("is_deleted.eq.false,is_deleted.is.null").gte("order_finished_at", range.start).lt("order_finished_at", range.end),
    supabaseAdmin.from("qiunai_staff_bonus").select("amount").eq("discord_id", discordId).gte("created_at", range.start).lt("created_at", range.end),
  ]);
  return [...(orders || []).map((item) => Number(item.staff_salary || 0)), ...(bonuses || []).map((item) => Number(item.amount || 0))].reduce((sum, amount) => sum + amount, 0);
}

export async function GET(request) {
  try {
    const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
    const url = new URL(request.url);
    const selectedMonth = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    const range = monthRange(selectedMonth);
    const adminMode = url.searchParams.get("mode") === "admin";
    if (adminMode) await requireAdmin(discordId);
    const query = supabaseAdmin.from("salary_requests").select("*").eq("organization_code", ORG).gte("application_date", range.start.slice(0, 10)).lt("application_date", range.end.slice(0, 10)).order("created_at", { ascending: false });
    if (!adminMode) query.eq("discord_id", discordId);
    const [{ data: requests, error }, { data: announcements }, salary] = await Promise.all([
      query,
      supabaseAdmin.from("salary_announcements").select("*").in("organization_code", [ORG, "all"]).eq("is_active", true).order("created_at", { ascending: false }),
      adminMode ? Promise.resolve(null) : priorMonthSalary(discordId, selectedMonth),
    ]);
    if (error) throw error;
    return NextResponse.json({ ok: true, requests: requests || [], announcements: announcements || [], priorMonthSalary: salary, welfareEligible: salary === null ? null : salary > 5000 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: friendlyError(error, "讀取申請資料失敗") }, { status: 400 });
  }
}

export async function POST(request) {
  try {
    const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
    const staff = await getStaff(discordId);
    const body = await request.json().catch(() => ({}));
    const group = body.requestGroup === "welfare" ? "welfare" : "administrative";
    const allowed = group === "welfare" ? WELFARE_TYPES : ADMIN_TYPES;
    const requestType = String(body.requestType || "");
    if (!allowed.includes(requestType)) throw new Error("申請項目不正確");
    if (group === "welfare") {
      const salary = await priorMonthSalary(discordId, new Date().toISOString().slice(0, 7));
      if (salary <= 5000) throw new Error("前一個月薪資需超過 5,000 元才可申請福利");
    }
    const name = staff.display_name || staff.real_name || staff.discord_name || discordId;
    const { data, error } = await supabaseAdmin.from("salary_requests").insert({
      organization_code: ORG, guild_id: null, discord_id: discordId, staff_name: name, department: DEPARTMENT,
      application_date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }), needed_date: body.neededDate || null,
      urgency: body.urgency === "urgent" || body.urgency === "急件" ? "急件" : "一般", request_group: group,
      approval_category: approvalCategory(requestType, group), request_type: requestType,
      form_data: { details: String(body.details || "").trim() }, status: "pending",
    }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, request: data });
  } catch (error) {
    return NextResponse.json({ ok: false, message: friendlyError(error, "送出申請失敗") }, { status: 400 });
  }
}

export async function PATCH(request) {
  try {
    const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
    await requireAdmin(discordId);
    const body = await request.json().catch(() => ({}));
    if (!body.id || !["approved", "rejected"].includes(body.status)) throw new Error("簽核資料不正確");
    const { data, error } = await supabaseAdmin.from("salary_requests").update({ status: body.status, review_result: String(body.reviewResult || "").trim() || (body.status === "approved" ? "核准" : "駁回"), reviewed_by: discordId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", body.id).eq("organization_code", ORG).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, request: data });
  } catch (error) {
    return NextResponse.json({ ok: false, message: friendlyError(error, "更新簽核失敗") }, { status: 400 });
  }
}
