import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeErpRequest } from "@/lib/erpAccess";
import { groupActivityResponses } from "@/lib/qiunaiActivityGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    await authorizeErpRequest(supabaseAdmin, request, "qiunai", "canViewAllAdmin");
    const { id } = await params;
    const { data: activity, error } = await supabaseAdmin.from("qiunai_activities").select("id,title,starts_at,allow_not_attending,allow_distance").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!activity) throw new Error("找不到活動");
    const { data: options, error: optionError } = await supabaseAdmin.from("qiunai_activity_options").select("id,label").eq("activity_id", id).order("sort_order");
    if (optionError) throw optionError;
    const { data: responses, error: responseError } = await supabaseAdmin.from("qiunai_activity_responses").select("id,response_status,selected_option_id,staff_nickname,staff_real_name,staff_phone").eq("activity_id", id).order("staff_nickname");
    if (responseError) throw responseError;
    const responseIds = (responses || []).map((item) => item.id);
    const { data: guests, error: guestError } = responseIds.length ? await supabaseAdmin.from("qiunai_activity_guests").select("response_id,slot,guest_name,guest_phone").in("response_id", responseIds).order("slot") : { data: [], error: null };
    if (guestError) throw guestError;
    const groups = groupActivityResponses({ ...activity, options: options || [], responses: responses || [] });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "秋奈 EIP";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("活動回覆名單", { pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } } });
    sheet.views = [{ state: "frozen", ySplit: 3 }];
    sheet.mergeCells("A1:G1");
    sheet.getCell("A1").value = `${activity.title}－活動回覆名單`;
    sheet.getCell("A1").font = { name: "Arial", size: 16, bold: true, color: { argb: "FF5B3768" } };
    sheet.getCell("A1").alignment = { horizontal: "left", vertical: "middle" };
    sheet.getRow(1).height = 26;
    sheet.getCell("A2").value = "活動時間";
    sheet.getCell("B2").value = new Date(activity.starts_at);
    sheet.getCell("B2").numFmt = "yyyy-mm-dd hh:mm";
    sheet.getCell("A3").value = `回覆總數：${(responses || []).length} 人`;
    sheet.getCell("A3").font = { name: "Arial", size: 11, bold: true, color: { argb: "FF5B3768" } };
    const headers = ["員工暱稱", "員工名字", "員工電話", "員工親友1", "親友電話", "員工親友2", "親友電話"];
    for (const group of groups) {
      sheet.addRow([]);
      const groupRow = sheet.addRow([`${group.label}（${group.responses.length} 人）`]);
      sheet.mergeCells(groupRow.number, 1, groupRow.number, 7);
      groupRow.height = 25;
      groupRow.getCell(1).font = { name: "Arial", size: 12, bold: true, color: { argb: "FF5B3768" } };
      groupRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8EDF8" } };
      const header = sheet.addRow(headers);
      header.height = 24;
      header.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5B3768" } };
      header.alignment = { horizontal: "center", vertical: "middle" };
      for (const response of group.responses) {
        const ownGuests = (guests || []).filter((guest) => guest.response_id === response.id);
        const first = ownGuests.find((guest) => guest.slot === 1);
        const second = ownGuests.find((guest) => guest.slot === 2);
        const row = sheet.addRow([response.staff_nickname || "", response.staff_real_name || "", response.staff_phone || "", first?.guest_name || "", first?.guest_phone || "", second?.guest_name || "", second?.guest_phone || ""]);
        row.font = { name: "Arial", size: 12 };
      }
      if (!group.responses.length) {
        const row = sheet.addRow(["尚無回覆"]);
        row.font = { name: "Arial", size: 12, color: { argb: "FF94A3B8" } };
      }
    }
    const usedRows = sheet.rowCount;
    sheet.columns = [{ width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
    sheet.eachRow((row) => { row.alignment = { ...row.alignment, vertical: "middle" }; row.height = Math.max(row.height || 0, 22); });
    for (let rowNumber = 4; rowNumber <= usedRows; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      if (!row.hasValues || row.cellCount === 1) continue;
      row.eachCell((cell) => { cell.border = { bottom: { style: "thin", color: { argb: "FFE5D8E8" } } }; });
    }
    sheet.headerFooter.oddFooter = "&L秋奈電競陪玩&C第 &P 頁，共 &N 頁&R&12";
    sheet.printArea = `A1:G${usedRows}`;
    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = activity.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
    return new NextResponse(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeName}-活動回覆名單.xlsx`)}`, "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error?.message || "產生 Excel 失敗" }, { status: 400 });
  }
}
