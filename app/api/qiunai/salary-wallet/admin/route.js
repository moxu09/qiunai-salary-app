import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  bulkDepositSalaryWallet,
  getAuthUserFromRequest,
  manuallyDepositSalaryWallet,
  settleSalaryWallet,
} from "@/lib/salaryWallet";

const walletConfig = {
  appKey: "qiunai",
  orderTable: "qiunai_salary_orders",
  orderDateColumn: "order_finished_at",
  orderSelect:
    "id, discord_id, staff_name, staff_salary, bonus_amount, service_name, order_id, order_finished_at, is_deleted, wallet_settled_at",
  bonusTable: "qiunai_staff_bonus",
  bonusSelect:
    "id, discord_id, staff_name, title, note, amount, created_at, wallet_settled_at",
};

async function requireAdmin(request) {
  const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);

  const { data, error } = await supabaseAdmin
    .from("qiunai_admins")
    .select("*")
    .eq("discord_id", discordId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error("你沒有後台管理權限");
  }

  return {
    discordId,
    admin: data,
  };
}

function normalizeGiftText(value) {
  return String(value || "")
    .trim()
    .replace(/^打賞[:：\s]*/, "")
    .replace(/\s+/g, "");
}

async function loadGiftNames() {
  const { data, error } = await supabaseAdmin
    .from("platform_gifts")
    .select("name")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[qiunai salary wallet admin] load gifts failed", error);
    throw new Error("讀取打賞禮物失敗");
  }

  return (data || [])
    .map((gift) => String(gift.name || "").trim())
    .filter(Boolean);
}

function isQiunaiTipOrder(order, giftNames) {
  const serviceName = String(order.service_name || "").trim();

  if (serviceName.includes("打賞")) return true;

  const normalizedService = normalizeGiftText(serviceName);
  if (!normalizedService) return false;

  return giftNames.some((giftName) => {
    const normalizedGift = normalizeGiftText(giftName);

    return (
      normalizedGift &&
      (normalizedService === normalizedGift ||
        normalizedService.includes(normalizedGift) ||
        normalizedGift.includes(normalizedService))
    );
  });
}

export async function GET(request) {
  try {
    await requireAdmin(request);
    await settleSalaryWallet(supabaseAdmin, walletConfig);

    const { data, error } = await supabaseAdmin
      .from("salary_withdraw_requests")
      .select("*")
      .eq("app_key", walletConfig.appKey)
      .order("requested_at", { ascending: false });

    if (error) {
      console.error("[qiunai salary wallet admin] load requests failed", error);
      throw new Error("讀取提領申請失敗");
    }

    return NextResponse.json({
      ok: true,
      requests: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message || "讀取提領申請失敗",
      },
      { status: 400 }
    );
  }
}

export async function POST(request) {
  try {
    const { discordId } = await requireAdmin(request);
    const body = await request.json();
    const action = String(body.action || "").trim();

    if (action === "bulk-deposit-wallet") {
      const giftNames = await loadGiftNames();
      const result = await bulkDepositSalaryWallet(
        supabaseAdmin,
        {
          ...walletConfig,
          isTipOrder: (order) => isQiunaiTipOrder(order, giftNames),
        },
        {
          startDate: body.startDate,
          endDate: body.endDate,
          adminDiscordId: discordId,
        }
      );

      return NextResponse.json({
        ok: true,
        result,
      });
    }

    if (action === "deposit-wallet") {
      const giftNames = await loadGiftNames();
      const result = await manuallyDepositSalaryWallet(
        supabaseAdmin,
        {
          ...walletConfig,
          isTipOrder: (order) => isQiunaiTipOrder(order, giftNames),
        },
        {
          discordId: body.discordId,
          staffName: body.staffName,
          types: body.types,
          manualAmount: body.manualAmount,
          startDate: body.startDate,
          endDate: body.endDate,
          note: "後台手動新增",
          adminDiscordId: discordId,
        }
      );

      return NextResponse.json({
        ok: true,
        result,
      });
    }

    const id = String(body.id || "").trim();

    if (!id) {
      throw new Error("缺少申請 ID");
    }

    if (action !== "approve" && action !== "reject") {
      throw new Error("未知的審核動作");
    }

    const payload =
      action === "approve"
        ? {
            status: "approved",
            reject_reason: null,
            reviewed_by: discordId,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        : {
            status: "rejected",
            reject_reason: String(body.reason || "").trim(),
            reviewed_by: discordId,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

    if (action === "reject" && !payload.reject_reason) {
      throw new Error("駁回需要填寫理由");
    }

    const { data: updatedRequest, error } = await supabaseAdmin
      .from("salary_withdraw_requests")
      .update(payload)
      .eq("id", id)
      .eq("app_key", walletConfig.appKey)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error(
        "[qiunai salary wallet admin] update request failed",
        error
      );
      throw new Error("更新提領申請失敗");
    }
    if (!updatedRequest) {
      throw new Error("這筆提領申請已由其他管理員處理。");
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message || "更新提領申請失敗",
      },
      { status: 400 }
    );
  }
}
