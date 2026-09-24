import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_ORIGIN = "https://qiunai.gaming.wearestilllhere.com";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

export function OPTIONS(request) {
  if (request.headers.get("origin") !== ALLOWED_ORIGIN) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  const { data, error } = await supabaseAdmin.rpc("qiunai_ichiban_stock");
  if (error) {
    return NextResponse.json(
      { ok: false, message: "獎池資訊暫時無法取得" },
      { status: 503, headers: corsHeaders },
    );
  }
  const prizes = (data || []).map((row) => ({
    id: row.prize_id,
    remaining: Number(row.remaining || 0),
  }));
  return NextResponse.json(
    { ok: true, remaining: prizes.reduce((sum, row) => sum + row.remaining, 0), prizes },
    { headers: corsHeaders },
  );
}
