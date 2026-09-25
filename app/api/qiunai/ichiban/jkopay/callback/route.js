import { getIchibanJkopayConfig, fulfillJkopayPayment } from "@/lib/ichibanJkopay";

// 街口通知只用來觸發查單；查單確認成功且金額吻合才抽獎。
export async function POST(request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 65536) return new Response("too large", { status: 413 });
    const body = await request.json();
    const tradeNo = String(body?.transaction?.platform_order_id || "");
    if (!/^QI[A-F0-9]{18}$/.test(tradeNo)) return new Response("invalid order", { status: 400 });
    const config = getIchibanJkopayConfig();
    const paid = await fulfillJkopayPayment(tradeNo, config, body?.transaction?.tradeNo || null);
    if (!paid) return new Response("pending", { status: 500 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[一番賞街口通知]", error?.message || error);
    return new Response("retry", { status: 500 });
  }
}
