import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://qiunai.gaming.wearestilllhere.com",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("salary_public_profiles")
      .select("discord_id,display_name,avatar_url,intro,note,games,is_online,can_take_order,updated_at")
      .eq("app_key", "qiunai")
      .eq("is_active", true);
    if (error) throw error;
    return NextResponse.json({ ok: true, profiles: data || [] }, { headers: CORS_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error?.message || "讀取官網陪陪資料失敗" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
