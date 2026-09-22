import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeErpRequest } from "@/lib/erpAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    await authorizeErpRequest(supabaseAdmin, request, "qiunai", "canViewAllAdmin");
    const { id } = await params;
    const { data: activity, error } = await supabaseAdmin.from("qiunai_activities").select("id,title,starts_at").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!activity) throw new Error("找不到活動");
    const { data: responses, error: responseError } = await supabaseAdmin.from("qiunai_activity_responses").select("id,staff_nickname,staff_real_name,staff_phone").eq("activity_id", id).eq("response_status", "attending").order("staff_nickname");
    if (responseError) throw responseError;
    const responseIds = (responses || []).map((item) => item.id);
    const { data: guests, error: guestError } = responseIds.length ? await supabaseAdmin.from("qiunai_activity_guests").select("response_id,slot,guest_name,guest_phone").in("response_id", responseIds).order("slot") : { data: [], error: null };
    if (guestError) throw guestError;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "秋奈 EIP";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("參與名單", { pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } } });
    sheet.views = [{ state: "frozen", ySplit: 3 }];
    sheet.mergeCells("A1:G1");
    sheet.getCell("A1").value = `${activity.title}－參與名單`;
    sheet.getCell("A1").font = { name: "Arial", size: 16, bold: true, color: { argb: "FF5B3768" } };
    sheet.getCell("A1").alignment = { horizontal: "left", vertical: "middle" };
    sheet.getRow(1).height = 26;
    sheet.getCell("A2").value = "活動時間";
    sheet.getCell("B2").value = new Date(activity.starts_at);
    sheet.getCell("B2").numFmt = "yyyy-mm-dd hh:mm";
    sheet.getRow(3).values = ["員工暱稱", "員工名字", "員工電話", "員工親友1", "親友電話", "員工親友2", "親友電話"];
    for (const response of responses || []) {
      const ownGuests = (guests || []).filter((guest) => guest.response_id === response.id);
      const first = ownGuests.find((guest) => guest.slot === 1);
      const second = ownGuests.find((guest) => guest.slot === 2);
      sheet.addRow([response.staff_nickname || "", response.staff_real_name || "", response.staff_phone || "", first?.guest_name || "", first?.guest_phone || "", second?.guest_name || "", second?.guest_phone || ""]);
    }
    const usedRows = Math.max(3, sheet.rowCount);
    sheet.autoFilter = `A3:G${usedRows}`;
    sheet.columns = [{ width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
    sheet.eachRow((row) => { row.font = { ...row.font, name: "Arial", size: 12 }; row.alignment = { vertical: "middle" }; row.height = Math.max(row.height || 0, 22); });
    const header = sheet.getRow(3);
    header.font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5B3768" } };
    header.alignment = { horizontal: "center", vertical: "middle" };
    for (let rowNumber = 3; rowNumber <= usedRows; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      row.eachCell((cell) => { cell.border = { bottom: { style: "thin", color: { argb: "FFE5D8E8" } } }; });
    }
    sheet.headerFooter.oddFooter = "&L秋奈電競陪玩&C第 &P 頁，共 &N 頁&R&12";
    sheet.printArea = `A1:G${usedRows}`;
    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = activity.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
    return new NextResponse(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeName}-參與名單.xlsx`)}`, "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error?.message || "產生 Excel 失敗" }, { status: 400 });
  }
}
