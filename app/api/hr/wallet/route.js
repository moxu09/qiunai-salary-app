import { hrAuth, hrFail } from "@/lib/hrServer";
import { hrSource } from "@/lib/hrUpstream";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { allocateWithdrawal, canonicalJson } from "@/lib/hrRoutes.mjs";
export const dynamic = "force-dynamic";
async function wallets(request, departments) {
  return Promise.all(
    departments.map(async ({ key }) => ({
      key,
      ...(await hrSource(request, key, "salary-wallet")),
    })),
  );
}
export async function GET(request) {
  try {
    const { departments } = await hrAuth(request);
    return Response.json(
      { ok: true, departments: await wallets(request, departments) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return hrFail(error);
  }
}
export async function POST(request) {
  try {
    const { discordId, departments } = await hrAuth(request);
    const body = await request.json();
    if (!/^[0-9a-f-]{36}$/i.test(body.idempotencyKey || "")) throw Error("申請識別碼無效");
    if (
      !["bank", "asd"].includes(body.destination) ||
      !["combined", "separate"].includes(body.mode)
    )
      throw Error("申請方式無效");
    const existing = await supabaseAdmin
      .from("hr_withdrawal_batches")
      .select("result,request_payload")
      .eq("id", body.idempotencyKey)
      .eq("discord_id", discordId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    const identity = {
      mode: body.mode,
      destination: body.destination,
      total: body.total ?? null,
      amounts: body.amounts ?? null,
    };
    if (existing.data) {
      if (canonicalJson(existing.data.request_payload) !== canonicalJson(identity))
        throw Error("同一申請識別碼不能用於不同金額");
      return Response.json({ ok: true, result: existing.data.result, duplicate: true });
    }
    const summaries = await wallets(request, departments);
    const balances = Object.fromEntries(
      summaries.map((d) => [d.key, Number(d.wallet.totals.available)]),
    );
    let amounts =
      body.mode === "combined" ? allocateWithdrawal(Number(body.total), balances) : body.amounts;
    if (
      !amounts ||
      typeof amounts !== "object" ||
      Array.isArray(amounts) ||
      Object.keys(amounts).some((key) => !departments.some((d) => d.key === key))
    )
      throw Error("申請部門無效");
    for (const [key, amount] of Object.entries(amounts)) {
      if (!Number.isSafeInteger(amount) || Number(amount) < 0 || Number(amount) > balances[key])
        throw Error("申請金額無效或超過餘額");
    }
    const total = Object.values(amounts).reduce((sum, value) => sum + Number(value), 0);
    if (
      body.destination === "bank" &&
      (total < 1001 ||
        (body.mode === "separate" &&
          Object.values(amounts).some((v) => Number(v) > 0 && Number(v) < 1001)))
    )
      throw Error("銀行提領金額必須高於 1,000 元");
    if (total < 1) throw Error("請輸入申請金額");
    const { data, error } = await supabaseAdmin.rpc("hr_request_withdrawal_atomic", {
      p_discord_id: discordId,
      p_batch_id: body.idempotencyKey,
      p_amounts: amounts,
      p_destination: body.destination,
      p_payload: identity,
      p_start_date: process.env.SALARY_WALLET_START_DATE || "2026-07-17",
    });
    if (error) throw error;
    return Response.json({ ok: true, result: data });
  } catch (error) {
    return hrFail(error);
  }
}
