import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getAuthUserFromRequest,
  getSalaryWalletSummary,
  settleSalaryWallet,
} from "@/lib/salaryWallet";

const walletConfig = {
  appKey: "qiunai",
  staffTable: "qiunai_staff",
  orderTable: "qiunai_salary_orders",
  orderDateColumn: "order_finished_at",
  orderSelect:
    "id, discord_id, staff_name, staff_salary, bonus_amount, service_name, order_id, order_finished_at, is_deleted, wallet_settled_at",
  bonusTable: "qiunai_staff_bonus",
  bonusSelect:
    "id, discord_id, staff_name, title, note, amount, created_at, wallet_settled_at",
};

async function getStaff(discordId) {
  const { data, error } = await supabaseAdmin
    .from(walletConfig.staffTable)
    .select("discord_id, discord_name, display_name, real_name, bank_name, bank_account")
    .eq("discord_id", discordId)
    .maybeSingle();

  if (error) {
    console.error("[qiunai salary wallet] load staff failed", error);
    throw new Error("讀取員工資料失敗");
  }

  return data;
}

function staffName(staff, fallback) {
  return (
    staff?.display_name ||
    staff?.real_name ||
    staff?.discord_name ||
    fallback ||
    staff?.discord_id ||
    null
  );
}

export async function GET(request) {
  try {
    const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);

    await settleSalaryWallet(supabaseAdmin, walletConfig);

    const staff = await getStaff(discordId);
    const wallet = await getSalaryWalletSummary(
      supabaseAdmin,
      walletConfig.appKey,
      discordId
    );

    return NextResponse.json({
      ok: true,
      staff,
      wallet,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message || "讀取薪資錢包失敗",
      },
      { status: 400 }
    );
  }
}

export async function POST(request) {
  try {
    const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
    const body = await request.json().catch(() => ({}));

    await settleSalaryWallet(supabaseAdmin, walletConfig);

    const staff = await getStaff(discordId);
    const wallet = await getSalaryWalletSummary(
      supabaseAdmin,
      walletConfig.appKey,
      discordId
    );

    if (!wallet.withdrawWindow.isOpen) {
      return NextResponse.json(
        {
          ok: false,
          message: "目前不在提領期間，每月 2 到 10 號可以提領。",
        },
        { status: 403 }
      );
    }

    if (wallet.pendingRequest) {
      return NextResponse.json(
        {
          ok: false,
          message: "你已經有提領申請在處理中。",
        },
        { status: 400 }
      );
    }

    const amount = Math.floor(Number(wallet.totals.available || 0));

    if (amount <= 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "目前沒有可提領薪資。",
        },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("salary_withdraw_requests")
      .insert({
        app_key: walletConfig.appKey,
        discord_id: discordId,
        staff_name: staffName(staff, discordId),
        amount,
        status: "pending",
        request_note: body.note || null,
      });

    if (error) {
      console.error("[qiunai salary wallet] create withdraw failed", error);
      throw new Error("建立提領申請失敗");
    }

    const nextWallet = await getSalaryWalletSummary(
      supabaseAdmin,
      walletConfig.appKey,
      discordId
    );

    return NextResponse.json({
      ok: true,
      wallet: nextWallet,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message || "送出提領申請失敗",
      },
      { status: 400 }
    );
  }
}
