import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import {
  getTaipeiMonthInput,
  monthInputToTaipeiRange,
} from "@/lib/taipeiTime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validMonth(value) {
  const text = String(value || "");
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text)
    ? text
    : getTaipeiMonthInput();
}

export async function GET(request) {
  try {
    const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
    const month = validMonth(new URL(request.url).searchParams.get("month"));
    const { startIso, endIso } = monthInputToTaipeiRange(month);

    const [
      { data: staff, error: staffError },
      { data: orders, error: orderError },
      { data: servicePoints, error: servicePointsError },
    ] =
      await Promise.all([
        supabaseAdmin
          .from("qiunai_staff")
          .select("discord_id")
          .eq("is_active", true),
        supabaseAdmin
          .from("qiunai_salary_orders")
          .select("discord_id, order_amount")
          .or("is_deleted.eq.false,is_deleted.is.null")
          .gte("order_finished_at", startIso)
          .lte("order_finished_at", endIso),
        supabaseAdmin
          .from("customer_service_order_points")
          .select("points")
          .eq("app_key", "qiunai")
          .eq("discord_id", discordId)
          .gte("served_at", startIso)
          .lte("served_at", endIso),
      ]);

    if (staffError) throw staffError;
    if (orderError) throw orderError;
    if (servicePointsError) throw servicePointsError;

    const activeIds = new Set((staff || []).map((row) => row.discord_id));
    if (!activeIds.has(discordId)) {
      throw new Error("找不到已啟用的員工資料");
    }

    const totals = new Map(
      [...activeIds].map((activeDiscordId) => [activeDiscordId, 0]),
    );
    for (const order of orders || []) {
      if (!activeIds.has(order.discord_id)) continue;
      totals.set(
        order.discord_id,
        (totals.get(order.discord_id) || 0) + Number(order.order_amount || 0),
      );
    }

    const performanceAmount = totals.get(discordId) || 0;
    const higherAmounts = [...totals.values()].filter(
      (amount) => amount > performanceAmount,
    );
    const previousAmount =
      higherAmounts.length > 0 ? Math.min(...higherAmounts) : null;

    return NextResponse.json({
      ok: true,
      ranking: {
        month,
        rank: higherAmounts.length + 1,
        participantCount: totals.size,
        performanceAmount,
        customerServicePoints: (servicePoints || []).reduce(
          (sum, row) => sum + Number(row.points || 0),
          0,
        ),
        gapToPrevious:
          previousAmount === null ? 0 : previousAmount - performanceAmount,
        isFirst: previousAmount === null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || "讀取業績排名失敗",
      },
      { status: 400 },
    );
  }
}
