import path from "node:path";
import PDFDocument from "pdfkit";

const regularFont = path.join(
  process.cwd(),
  "node_modules/@fontsource/noto-sans-tc/files/noto-sans-tc-chinese-traditional-400-normal.woff"
);
const boldFont = path.join(
  process.cwd(),
  "node_modules/@fontsource/noto-sans-tc/files/noto-sans-tc-chinese-traditional-700-normal.woff"
);

const PAGE_MARGIN = 40;
const TABLE_COLUMNS = [
  { key: "date", label: "申請時間", width: 108, align: "left" },
  { key: "amount", label: "申請金額", width: 78, align: "right" },
  { key: "welfare", label: "福利金", width: 66, align: "right" },
  { key: "service", label: "手續費", width: 62, align: "right" },
  { key: "payout", label: "實際匯款", width: 82, align: "right" },
  { key: "status", label: "狀態", width: 76, align: "center" },
];

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  return `NT$ ${numberValue(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function taipeiDateTime(value) {
  if (!value) return "-";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value || "";

  return `${part("year")}/${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
}

function statusText(status) {
  if (status === "approved") return "已核准";
  if (status === "rejected") return "已駁回";
  return "待審核";
}

function maskAccount(value) {
  const account = String(value || "").trim();
  if (!account) return "未填寫";
  if (account.length <= 4) return account;
  return `${"*".repeat(Math.min(8, account.length - 4))}${account.slice(-4)}`;
}

function drawSummaryCard(doc, x, y, width, label, value, accent) {
  doc
    .roundedRect(x, y, width, 62, 10)
    .fillAndStroke("#fff9fc", "#f3d6e8");
  doc.font("Regular").fontSize(8.5).fillColor("#8b5a8f");
  doc.text(label, x + 12, y + 10, { width: width - 24 });
  doc.font("Bold").fontSize(13).fillColor(accent);
  doc.text(value, x + 12, y + 31, { width: width - 24 });
}

function drawTableHeader(doc, y, accent) {
  const tableWidth = TABLE_COLUMNS.reduce((sum, column) => sum + column.width, 0);
  doc.rect(PAGE_MARGIN, y, tableWidth, 28).fill(accent);

  let x = PAGE_MARGIN;
  for (const column of TABLE_COLUMNS) {
    doc.font("Bold").fontSize(8).fillColor("#ffffff");
    doc.text(column.label, x + 5, y + 9, {
      width: column.width - 10,
      align: column.align,
      lineBreak: false,
    });
    x += column.width;
  }

  return y + 28;
}

function addPageHeader(doc, accent, company, from, to) {
  doc.rect(0, 0, doc.page.width, 56).fill(accent);
  doc.font("Bold").fontSize(13).fillColor("#ffffff");
  doc.text(`${company} - 提領薪資單`, PAGE_MARGIN, 18);
  doc.font("Regular").fontSize(8).fillColor("#fce7f3");
  doc.text(`${from} - ${to}`, PAGE_MARGIN, 37);
}

export async function createWithdrawalStatementPdf({
  company,
  employee,
  from,
  to,
  requests,
  accent = "#db2777",
}) {
  const doc = new PDFDocument({
    size: "A4",
    font: regularFont,
    margins: {
      top: PAGE_MARGIN,
      right: PAGE_MARGIN,
      bottom: 0,
      left: PAGE_MARGIN,
    },
    bufferPages: true,
    info: {
      Title: `${company} 提領薪資單 ${from} - ${to}`,
      Author: company,
      Subject: "員工薪資提領紀錄",
    },
  });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.registerFont("Regular", regularFont);
  doc.registerFont("Bold", boldFont);

  doc.rect(0, 0, doc.page.width, 112).fill(accent);
  doc.font("Bold").fontSize(24).fillColor("#ffffff");
  doc.text("提領薪資單", PAGE_MARGIN, 35);
  doc.font("Regular").fontSize(10).fillColor("#fce7f3");
  doc.text(company, PAGE_MARGIN, 70);
  doc.text(`查詢期間 ${from} - ${to}`, PAGE_MARGIN, 88);

  doc
    .roundedRect(PAGE_MARGIN, 132, 515, 76, 12)
    .fillAndStroke("#ffffff", "#f3d6e8");
  doc.font("Bold").fontSize(11).fillColor("#3f2947");
  doc.text(employee.name || employee.discordId, 54, 147, { width: 235 });
  doc.font("Regular").fontSize(8.5).fillColor("#8b5a8f");
  doc.text(`Discord ID: ${employee.discordId}`, 54, 169, { width: 235 });
  doc.text(`銀行: ${employee.bankName || "未填寫"}`, 310, 147, { width: 220 });
  doc.text(`帳號: ${maskAccount(employee.bankAccount)}`, 310, 169, {
    width: 220,
  });

  const approved = requests.filter((request) => request.status === "approved");
  const approvedRequested = approved.reduce(
    (sum, request) => sum + numberValue(request.amount),
    0
  );
  const approvedFees = approved.reduce(
    (sum, request) =>
      sum +
      numberValue(request.welfare_fee) +
      numberValue(request.service_fee),
    0
  );
  const approvedPayout = approved.reduce(
    (sum, request) => sum + numberValue(request.payout_amount),
    0
  );

  drawSummaryCard(doc, 40, 226, 160, "已核准申請金額", money(approvedRequested), accent);
  drawSummaryCard(doc, 217, 226, 160, "福利金與手續費", money(approvedFees), accent);
  drawSummaryCard(doc, 394, 226, 161, "已核准實際匯款", money(approvedPayout), accent);

  let y = drawTableHeader(doc, 310, accent);

  if (requests.length === 0) {
    doc.font("Regular").fontSize(10).fillColor("#8b5a8f");
    doc.text("此查詢期間沒有提領紀錄。", PAGE_MARGIN, y + 24, {
      width: 472,
      align: "center",
    });
  } else {
    requests.forEach((request, index) => {
      if (y + 38 > doc.page.height - 58) {
        doc.addPage();
        addPageHeader(doc, accent, company, from, to);
        y = drawTableHeader(doc, 74, accent);
      }

      const row = {
        date: taipeiDateTime(request.requested_at),
        amount: money(request.amount),
        welfare: money(request.welfare_fee),
        service: money(request.service_fee),
        payout:
          request.status === "rejected" ? "-" : money(request.payout_amount),
        status: statusText(request.status),
      };
      const rowFill = index % 2 === 0 ? "#ffffff" : "#fff9fc";
      const tableWidth = TABLE_COLUMNS.reduce(
        (sum, column) => sum + column.width,
        0
      );
      doc.rect(PAGE_MARGIN, y, tableWidth, 34).fill(rowFill);
      doc
        .moveTo(PAGE_MARGIN, y + 34)
        .lineTo(PAGE_MARGIN + tableWidth, y + 34)
        .strokeColor("#f3d6e8")
        .lineWidth(0.6)
        .stroke();

      let x = PAGE_MARGIN;
      for (const column of TABLE_COLUMNS) {
        const isStatus = column.key === "status";
        const statusColor =
          request.status === "approved"
            ? "#047857"
            : request.status === "rejected"
              ? "#be123c"
              : "#b45309";
        doc
          .font(isStatus ? "Bold" : "Regular")
          .fontSize(column.key === "date" ? 7.2 : 7.5)
          .fillColor(isStatus ? statusColor : "#5b3768");
        doc.text(row[column.key], x + 5, y + 10.5, {
          width: column.width - 10,
          align: column.align,
          lineBreak: false,
        });
        x += column.width;
      }

      y += 34;
    });
  }

  const generatedAt = taipeiDateTime(new Date().toISOString());
  const pageRange = doc.bufferedPageRange();
  for (let pageIndex = 0; pageIndex < pageRange.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    doc.page.margins.bottom = 0;
    doc
      .moveTo(PAGE_MARGIN, doc.page.height - 37)
      .lineTo(doc.page.width - PAGE_MARGIN, doc.page.height - 37)
      .strokeColor("#f3d6e8")
      .lineWidth(0.6)
      .stroke();
    doc.font("Regular").fontSize(7.5).fillColor("#a36b9e");
    doc.text(`產生時間: ${generatedAt}`, PAGE_MARGIN, doc.page.height - 27, {
      width: 300,
      height: 10,
      lineBreak: false,
    });
    doc.text(`第 ${pageIndex + 1} / ${pageRange.count} 頁`, 445, doc.page.height - 27, {
      width: 110,
      height: 10,
      align: "right",
      lineBreak: false,
    });
  }

  doc.end();
  return completed;
}
