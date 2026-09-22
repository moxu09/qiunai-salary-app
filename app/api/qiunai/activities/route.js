import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeErpRequest } from "@/lib/erpAccess";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";

export const dynamic = "force-dynamic";

const MAX_OPTIONS = 20;
const clean = (value, max = 5000) => String(value ?? "").trim().slice(0, max);

async function requireAdmin(request) {
  return authorizeErpRequest(supabaseAdmin, request, "qiunai", "canViewAllAdmin");
}

function parseOptions(value) {
  return (Array.isArray(value) ? value : []).map((item, index) => ({
    label: clean(item?.label ?? item, 200),
    note: clean(item?.note, 1000) || null,
    sort_order: index,
  })).filter((item) => item.label).slice(0, MAX_OPTIONS);
}

async function optionsFor(ids) {
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin.from("qiunai_activity_options").select("*").in("activity_id", ids).order("sort_order");
  if (error) throw error;
  return data || [];
}

async function employeeEligibility(activity, staff) {
  const { count, error } = await supabaseAdmin.from("qiunai_salary_orders")
    .select("id", { count: "exact", head: true }).eq("discord_id", staff.discord_id)
    .or("is_deleted.eq.false,is_deleted.is.null");
  if (error) throw error;
  const employmentDays = Math.max(0, Math.floor((Date.now() - new Date(staff.created_at).getTime()) / 86400000));
  const completedOrders = count || 0;
  const reasons = [];
  if (completedOrders < activity.min_completed_orders) reasons.push(`完成訂單需達 ${activity.min_completed_orders} 筆（目前 ${completedOrders} 筆）`);
  if (employmentDays < activity.min_employment_days) reasons.push(`到職需滿 ${activity.min_employment_days} 天（目前 ${employmentDays} 天）`);
  return { eligible: reasons.length === 0, reasons, completedOrders, employmentDays };
}

async function adminList() {
  const { data: activities, error } = await supabaseAdmin.from("qiunai_activities").select("*").order("starts_at", { ascending: false });
  if (error) throw error;
  const ids = (activities || []).map((item) => item.id);
  const [options, responseResult] = await Promise.all([
    optionsFor(ids),
    ids.length ? supabaseAdmin.from("qiunai_activity_responses").select("*").in("activity_id", ids).order("submitted_at") : { data: [], error: null },
  ]);
  if (responseResult.error) throw responseResult.error;
  const responses = responseResult.data || [];
  const responseIds = responses.map((item) => item.id);
  const { data: guests, error: guestError } = responseIds.length
    ? await supabaseAdmin.from("qiunai_activity_guests").select("*").in("response_id", responseIds).order("slot")
    : { data: [], error: null };
  if (guestError) throw guestError;
  return (activities || []).map((activity) => {
    const activityResponses = responses.filter((item) => item.activity_id === activity.id).map((item) => ({ ...item, guests: (guests || []).filter((guest) => guest.response_id === item.id) }));
    return {
      ...activity,
      options: options.filter((option) => option.activity_id === activity.id),
      responses: activityResponses,
      stats: {
        attending: activityResponses.filter((item) => item.response_status === "attending").length,
        not_attending: activityResponses.filter((item) => item.response_status === "not_attending").length,
        distance: activityResponses.filter((item) => item.response_status === "distance").length,
      },
    };
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("admin") === "1") {
      await requireAdmin(request);
      return NextResponse.json({ ok: true, activities: await adminList() });
    }
    const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
    const { data: staff, error: staffError } = await supabaseAdmin.from("qiunai_staff").select("discord_id,display_name,discord_name,real_name,phone,created_at,is_active").eq("discord_id", discordId).maybeSingle();
    if (staffError) throw staffError;
    if (!staff?.is_active) throw new Error("找不到有效員工資料");
    const { data: activities, error } = await supabaseAdmin.from("qiunai_activities").select("*").eq("is_published", true).order("starts_at", { ascending: true });
    if (error) throw error;
    const ids = (activities || []).map((item) => item.id);
    const [options, responseResult] = await Promise.all([
      optionsFor(ids),
      ids.length ? supabaseAdmin.from("qiunai_activity_responses").select("*").in("activity_id", ids).eq("discord_id", discordId) : { data: [], error: null },
    ]);
    if (responseResult.error) throw responseResult.error;
    const responses = responseResult.data || [];
    const responseIds = responses.map((item) => item.id);
    const { data: guests, error: guestError } = responseIds.length ? await supabaseAdmin.from("qiunai_activity_guests").select("*").in("response_id", responseIds).order("slot") : { data: [], error: null };
    if (guestError) throw guestError;
    const result = await Promise.all((activities || []).map(async (activity) => {
      const response = responses.find((item) => item.activity_id === activity.id) || null;
      return { ...activity, options: options.filter((item) => item.activity_id === activity.id), eligibility: await employeeEligibility(activity, staff), response: response ? { ...response, guests: (guests || []).filter((guest) => guest.response_id === response.id) } : null, locked: Date.now() >= new Date(activity.response_deadline).getTime() };
    }));
    return NextResponse.json({ ok: true, activities: result, staff: { nickname: staff.display_name || staff.discord_name, realName: staff.real_name, phone: staff.phone } });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error?.message || "讀取活動失敗" }, { status: 400 });
  }
}

export async function POST(request) {
  try {
    const access = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const title = clean(body.title, 120);
    const startsAt = new Date(body.startsAt);
    const responseDeadline = new Date(body.responseDeadline || startsAt.getTime() - 86400000);
    if (!title || Number.isNaN(startsAt.getTime())) throw new Error("請填寫活動名稱與開始時間");
    if (Number.isNaN(responseDeadline.getTime()) || responseDeadline > startsAt) throw new Error("報名截止時間必須早於活動開始時間");
    const options = parseOptions(body.options);
    const { data, error } = await supabaseAdmin.from("qiunai_activities").insert({
      title, description: clean(body.description), location: clean(body.location, 300) || null,
      starts_at: startsAt.toISOString(), response_deadline: responseDeadline.toISOString(),
      min_completed_orders: Math.max(0, Math.floor(Number(body.minCompletedOrders) || 0)),
      min_employment_days: Math.max(0, Math.floor(Number(body.minEmploymentDays) || 0)),
      eligibility_note: clean(body.eligibilityNote, 1000) || null,
      participant_note: clean(body.participantNote, 2000) || null,
      is_published: body.isPublished !== false, created_by: access.discordId,
    }).select("*").single();
    if (error) throw error;
    if (options.length) {
      const { error: optionError } = await supabaseAdmin.from("qiunai_activity_options").insert(options.map((item) => ({ ...item, activity_id: data.id })));
      if (optionError) { await supabaseAdmin.from("qiunai_activities").delete().eq("id", data.id); throw optionError; }
    }
    return NextResponse.json({ ok: true, activity: data });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error?.message || "發布活動失敗" }, { status: 400 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === "respond") {
      const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
      const activityId = clean(body.activityId, 100);
      const status = clean(body.status, 30);
      if (!["attending", "not_attending", "distance"].includes(status)) throw new Error("請選擇參與狀態");
      const { data: activity, error } = await supabaseAdmin.from("qiunai_activities").select("*").eq("id", activityId).eq("is_published", true).maybeSingle();
      if (error) throw error;
      if (!activity) throw new Error("找不到活動");
      if (Date.now() >= new Date(activity.response_deadline).getTime()) throw new Error("活動報名已截止，開始前 24 小時不能再修改");
      const { data: staff, error: staffError } = await supabaseAdmin.from("qiunai_staff").select("discord_id,display_name,discord_name,real_name,phone,created_at,is_active").eq("discord_id", discordId).maybeSingle();
      if (staffError) throw staffError;
      if (!staff?.is_active) throw new Error("找不到有效員工資料");
      const eligibility = await employeeEligibility(activity, staff);
      if (!eligibility.eligible) throw new Error(`你目前不符合參與門檻：${eligibility.reasons.join("、")}`);
      const guests = status === "attending" ? (Array.isArray(body.guests) ? body.guests : []).slice(0, 2).map((guest, index) => ({ slot: index + 1, guest_name: clean(guest.name, 100), guest_phone: clean(guest.phone, 30) })).filter((guest) => guest.guest_name && guest.guest_phone) : [];
      if ((Array.isArray(body.guests) ? body.guests : []).length > 2) throw new Error("每位員工最多攜帶兩位親友");
      const optionId = status === "attending" && body.optionId ? clean(body.optionId, 100) : null;
      if (optionId) {
        const { data: option } = await supabaseAdmin.from("qiunai_activity_options").select("id").eq("id", optionId).eq("activity_id", activityId).maybeSingle();
        if (!option) throw new Error("活動選項不正確");
      }
      const { data: response, error: responseError } = await supabaseAdmin.from("qiunai_activity_responses").upsert({
        activity_id: activityId, discord_id: discordId, response_status: status, selected_option_id: optionId,
        staff_nickname: staff.display_name || staff.discord_name || discordId, staff_real_name: staff.real_name || null, staff_phone: staff.phone || null,
        submitted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "activity_id,discord_id" }).select("*").single();
      if (responseError) throw responseError;
      const { error: deleteError } = await supabaseAdmin.from("qiunai_activity_guests").delete().eq("response_id", response.id);
      if (deleteError) throw deleteError;
      if (guests.length) {
        const { error: guestError } = await supabaseAdmin.from("qiunai_activity_guests").insert(guests.map((guest) => ({ ...guest, response_id: response.id })));
        if (guestError) throw guestError;
      }
      return NextResponse.json({ ok: true, response });
    }
    await requireAdmin(request);
    const id = clean(body.id, 100);
    if (!id) throw new Error("缺少活動 ID");
    if (body.action === "publish") {
      const { error } = await supabaseAdmin.from("qiunai_activities").update({ is_published: Boolean(body.isPublished), updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    throw new Error("活動操作不正確");
  } catch (error) {
    return NextResponse.json({ ok: false, message: error?.message || "更新活動失敗" }, { status: 400 });
  }
}

export async function DELETE(request) {
  try {
    await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const id = clean(body.id, 100);
    const { count } = await supabaseAdmin.from("qiunai_activity_responses").select("id", { count: "exact", head: true }).eq("activity_id", id);
    if (count) throw new Error("活動已有員工回覆，請改為停止發布以保留紀錄");
    const { error } = await supabaseAdmin.from("qiunai_activities").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error?.message || "刪除活動失敗" }, { status: 400 });
  }
}
