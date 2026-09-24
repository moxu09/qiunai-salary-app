import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ICHIBAN_CORS, ICHIBAN_ORIGIN, claimDigest } from "@/lib/ichibanEcpay";

export function OPTIONS(request) {
  return new Response(null, { status: request.headers.get("origin") === ICHIBAN_ORIGIN ? 204 : 403, headers: ICHIBAN_CORS });
}
export async function POST(request) {
  if (request.headers.get("origin") !== ICHIBAN_ORIGIN) return NextResponse.json({ ok: false }, { status: 403 });
  try {
    const body = await request.json();
    const tradeNo = String(body.tradeNo || "");
    const claimToken = String(body.claimToken || "");
    if (!/^QI[A-F0-9]{18}$/.test(tradeNo) || !/^[0-9a-f]{64}$/.test(claimToken))
      return NextResponse.json({ ok: false }, { status: 400, headers: ICHIBAN_CORS });
    const { data: order, error } = await supabaseAdmin.from("qiunai_ichiban_web_orders")
      .select("status,challenge_id,draw_id,created_at").eq("merchant_trade_no", tradeNo).maybeSingle();
    if (error) throw error;
    if (!order) return NextResponse.json({ ok: false }, { status: 404, headers: ICHIBAN_CORS });
    const { data: identity } = await supabaseAdmin.from("qiunai_ichiban_identity_challenges")
      .select("token_digest").eq("id", order.challenge_id).maybeSingle();
    if (!identity || identity.token_digest !== claimDigest(claimToken))
      return NextResponse.json({ ok: false }, { status: 403, headers: ICHIBAN_CORS });
    let draw = null;
    if (order.draw_id) {
      const { data } = await supabaseAdmin.from("qiunai_ichiban_draws")
        .select("id,prize_id,ticket_no,is_last_one").eq("id", order.draw_id).maybeSingle();
      draw = data;
    }
    return NextResponse.json({ ok: true, status: order.status, draw }, { headers: ICHIBAN_CORS });
  } catch (error) {
    console.error("[一番賞付款查詢]", error?.message || error);
    return NextResponse.json({ ok: false, message: "查詢暫時失敗" }, { status: 503, headers: ICHIBAN_CORS });
  }
}
