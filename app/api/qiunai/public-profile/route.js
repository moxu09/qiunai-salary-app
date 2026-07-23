import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import { getErpAccessByDiscordId } from "@/lib/erpAccess";

const APP_KEY = "qiunai";
const STAFF_TABLE = "qiunai_staff";

function cleanText(value, maxLength = 500) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function cleanGames(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean))].slice(0, 30);
}

async function auth(request) {
  return getAuthUserFromRequest(supabaseAdmin, request);
}

async function getStaff(discordId) {
  const { data, error } = await supabaseAdmin
    .from(STAFF_TABLE)
    .select("discord_id,discord_name,display_name,avatar_url,is_online,can_take_order,is_active")
    .eq("discord_id", discordId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("找不到員工資料");
  return data;
}

async function seedProfile(staff) {
  const { data, error } = await supabaseAdmin
    .from("salary_public_profiles")
    .upsert({
      app_key: APP_KEY,
      discord_id: staff.discord_id,
      display_name: staff.display_name || staff.discord_name || "秋奈陪陪",
      avatar_url: staff.avatar_url || null,
      is_online: Boolean(staff.is_online),
      can_take_order: staff.can_take_order !== false,
      is_active: staff.is_active !== false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "app_key,discord_id", ignoreDuplicates: false })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function GET(request) {
  try {
    const { discordId } = await auth(request);
    if (new URL(request.url).searchParams.get("admin") === "1") {
      const access = await getErpAccessByDiscordId(supabaseAdmin, APP_KEY, discordId);
      if (!access.capabilities.canViewAllAdmin) throw new Error("你沒有員工管理權限");
      const { data, error } = await supabaseAdmin.from("salary_public_profiles")
        .select("*").eq("app_key", APP_KEY).order("display_name");
      if (error) throw error;
      return NextResponse.json({ ok: true, profiles: data || [] });
    }
    const staff = await getStaff(discordId);
    const profile = await seedProfile(staff);
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error.message || "讀取公開資料失敗" }, { status: 400 });
  }
}

export async function POST(request) {
  try {
    const { discordId } = await auth(request);
    const body = await request.json().catch(() => ({}));

    if (body.action === "set-featured") {
      const { data: admin } = await supabaseAdmin
        .from(ADMIN_TABLE).select("discord_id").eq("discord_id", discordId)
        .eq("is_active", true).maybeSingle();
      if (!admin) throw new Error("你沒有後台管理權限");

      const { data: staffRows, error: staffError } = await supabaseAdmin
        .from(STAFF_TABLE)
        .select("discord_id,discord_name,display_name,avatar_url,is_online,can_take_order,is_active");
      if (staffError) throw staffError;
      if (staffRows?.length) {
        const { error: seedError } = await supabaseAdmin
          .from("salary_public_profiles")
          .upsert(staffRows.map((staff) => ({
            app_key: APP_KEY,
            discord_id: staff.discord_id,
            display_name: staff.display_name || staff.discord_name || "秋奈陪陪",
            avatar_url: staff.avatar_url || null,
            is_online: Boolean(staff.is_online),
            can_take_order: staff.can_take_order !== false,
            is_active: staff.is_active !== false,
            updated_at: new Date().toISOString(),
          })), { onConflict: "app_key,discord_id" });
        if (seedError) throw seedError;
      }

      const ids = [...new Set((Array.isArray(body.discordIds) ? body.discordIds : [])
        .map((id) => String(id || "").trim()).filter(Boolean))];
      const month = String(body.month || "").match(/^\d{4}-\d{2}$/)?.[0] ||
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit" }).format(new Date());

      await supabaseAdmin.from("salary_public_profiles")
        .update({ is_featured: false, featured_month: null, updated_at: new Date().toISOString() })
        .eq("app_key", APP_KEY);
      if (ids.length) {
        const { error } = await supabaseAdmin.from("salary_public_profiles")
          .update({ is_featured: true, featured_month: `${month}-01`, updated_at: new Date().toISOString() })
          .eq("app_key", APP_KEY).in("discord_id", ids);
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }

    const staff = await getStaff(discordId);
    await seedProfile(staff);
    const patch = { updated_at: new Date().toISOString() };
    if ("displayName" in body) patch.display_name = cleanText(body.displayName, 80);
    if ("avatarUrl" in body) patch.avatar_url = cleanText(body.avatarUrl, 1000);
    if ("intro" in body) patch.intro = cleanText(body.intro, 600);
    if ("inviteUrl" in body) patch.invite_url = cleanText(body.inviteUrl, 1000);
    if ("games" in body) patch.games = cleanGames(body.games);
    if ("isOnline" in body) patch.is_online = Boolean(body.isOnline);
    if ("canTakeOrder" in body) patch.can_take_order = Boolean(body.canTakeOrder);

    const { data, error } = await supabaseAdmin.from("salary_public_profiles")
      .update(patch).eq("app_key", APP_KEY).eq("discord_id", discordId).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, profile: data });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error.message || "儲存公開資料失敗" }, { status: 400 });
  }
}
