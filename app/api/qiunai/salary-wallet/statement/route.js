import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import { createWithdrawalStatementPdf } from "@/lib/withdrawalStatementPdf.mjs";

export const runtime = "nodejs";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (!DATE_PATTERN.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return false;

  return (
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date) === value
  );
}

function parseRange(request) {
  const url = new URL(request.url);
  const from = String(url.searchParams.get("from") || "").trim();
  const to = String(url.searchParams.get("to") || "").trim();

  if (!validDate(from) || !validDate(to)) {
    throw new Error("請選擇完整且正確的開始與結束日期");
  }

  if (from > to) {
    throw new Error("開始日期不能晚於結束日期");
  }

  const start = new Date(`${from}T00:00:00+08:00`);
  const end = new Date(`${to}T23:59:59.999+08:00`);
  if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) {
    throw new Error("單次最多查詢 366 天");
  }

  return {
    from,
    to,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    format: url.searchParams.get("format") || "json",
  };
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function summarize(requests) {
  const approved = requests.filter((request) => request.status === "approved");

  return {
    requestCount: requests.length,
    approvedCount: approved.length,
    requestedAmount: approved.reduce(
      (sum, request) => sum + numberValue(request.amount),
      0
    ),
    welfareFee: approved.reduce(
      (sum, request) => sum + numberValue(request.welfare_fee),
      0
    ),
    serviceFee: approved.reduce(
      (sum, request) => sum + numberValue(request.service_fee),
      0
    ),
    payoutAmount: approved.reduce(
      (sum, request) => sum + numberValue(request.payout_amount),
      0
    ),
  };
}

export async function GET(request) {
  try {
    const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
    const range = parseRange(request);
    const [{ data: staff, error: staffError }, { data, error }] =
      await Promise.all([
        supabaseAdmin
          .from("qiunai_staff")
          .select(
            "discord_id, discord_name, display_name, real_name, bank_name, bank_account"
          )
          .eq("discord_id", discordId)
          .maybeSingle(),
        supabaseAdmin
          .from("salary_withdraw_requests")
          .select(
            "id, amount, service_fee, welfare_fee, payout_amount, status, reject_reason, request_note, requested_at, reviewed_at"
          )
          .eq("app_key", "qiunai")
          .eq("discord_id", discordId)
          .gte("requested_at", range.startIso)
          .lte("requested_at", range.endIso)
          .order("requested_at", { ascending: true })
          .limit(1000),
      ]);

    if (staffError) {
      console.error("[qiunai statement] load staff failed", staffError);
      throw new Error("讀取員工資料失敗");
    }

    if (error) {
      console.error("[qiunai statement] load requests failed", error);
      throw new Error("讀取提領紀錄失敗");
    }

    const requests = data || [];
    const summary = summarize(requests);

    if (range.format !== "pdf") {
      return NextResponse.json({
        ok: true,
        range: { from: range.from, to: range.to },
        requests: requests.slice().reverse(),
        summary,
      });
    }

    const pdf = await createWithdrawalStatementPdf({
      company: "秋奈電競陪玩 We Are Still Here",
      employee: {
        discordId,
        name:
          staff?.display_name ||
          staff?.real_name ||
          staff?.discord_name ||
          discordId,
        bankName: staff?.bank_name,
        bankAccount: staff?.bank_account,
      },
      from: range.from,
      to: range.to,
      requests,
      accent: "#db2777",
    });
    const filename = `qiunai-salary-withdrawal-${range.from}-${range.to}.pdf`;

    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error.message || "建立提領薪資單失敗" },
      { status: 400 }
    );
  }
}
