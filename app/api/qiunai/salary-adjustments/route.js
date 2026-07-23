import { NextResponse } from "next/server";
import { authorizeErpRequest, erpErrorResponse } from "@/lib/erpAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORGANIZATION = "qiunai";
const ADJUSTMENT_TABLE = "qiunai_staff_bonus";

async function restoreAdjustment(adjustment) {
  const { error } = await supabaseAdmin
    .from(ADJUSTMENT_TABLE)
    .upsert(adjustment, { onConflict: "id" });

  if (error) {
    console.error("[qiunai salary adjustments] rollback failed", error);
  }
}

export async function DELETE(request) {
  try {
    const actor = await authorizeErpRequest(
      supabaseAdmin,
      request,
      ORGANIZATION,
      "canViewAllAdmin"
    );
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id) throw new Error("缺少獎金或扣薪 ID");

    const { data: adjustment, error: readError } = await supabaseAdmin
      .from(ADJUSTMENT_TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!adjustment) {
      const error = new Error("找不到這筆獎金或扣薪，可能已被刪除");
      error.status = 404;
      throw error;
    }

    const { error: deleteError } = await supabaseAdmin
      .from(ADJUSTMENT_TABLE)
      .delete()
      .eq("id", id);
    if (deleteError) throw deleteError;

    const { error: walletError, count: walletEntriesRemoved } =
      await supabaseAdmin
        .from("salary_wallet_entries")
        .delete({ count: "exact" })
        .eq("app_key", ORGANIZATION)
        .eq("source_table", ADJUSTMENT_TABLE)
        .eq("source_id", id)
        .eq("entry_type", "staff_bonus");

    if (walletError) {
      await restoreAdjustment(adjustment);
      throw new Error("刪除失敗，原資料已保留，請稍後再試");
    }

    return NextResponse.json({
      ok: true,
      deletedId: id,
      deletedBy: actor.discordId,
      walletEntriesRemoved: walletEntriesRemoved || 0,
    });
  } catch (error) {
    console.error("[qiunai salary adjustments] delete failed", error);
    return erpErrorResponse(error, "刪除獎金或扣薪失敗");
  }
}
