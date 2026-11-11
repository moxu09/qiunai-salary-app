import { acceptDepositCallback } from "@/lib/hrContractDeposit";

export const runtime = "nodejs";
export async function POST(request, { params }) {
  const { method } = await params;
  if (!["ecpay", "jkopay"].includes(method)) return new Response(null, { status: 404 });
  if (Number(request.headers.get("content-length")) > 65536) return new Response(null, { status: 413 });
  try {
    const paid = await acceptDepositCallback(method, await request.json());
    if (!paid) return new Response("pending", { status: 503 });
    return method === "ecpay" ? new Response("1|OK") : Response.json({ ok: true });
  } catch (error) {
    console.error("[contract-deposit callback]", method, error?.code || error?.status || "gateway verification failed");
    return new Response("retry", { status: error?.status === 400 ? 400 : 503 });
  }
}
