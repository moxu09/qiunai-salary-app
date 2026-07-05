const LEDGER_REPORT_TYPES = new Set([
  "customer_topup",
  "monthly_payment",
  "manual_monthly_charge",
  "refund",
  "manual_adjustment",
]);

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function makeMonthRange(monthText) {
  const value = String(monthText || "").trim();
  const matched = value.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const year = matched ? Number(matched[1]) : now.getFullYear();
  const month = matched ? Number(matched[2]) : now.getMonth() + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  return {
    month: monthKey,
    startIso: new Date(`${monthKey}-01T00:00:00+08:00`).toISOString(),
    endIso: new Date(
      `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+08:00`
    ).toISOString(),
  };
}

function makeRow(input) {
  return {
    id: input.id,
    occurred_at: input.occurred_at,
    category: input.category,
    subject: input.subject || "",
    amount: numberValue(input.amount),
    cash_amount: numberValue(input.cash_amount),
    revenue_amount: numberValue(input.revenue_amount),
    expense_amount: numberValue(input.expense_amount),
    discount_amount: numberValue(input.discount_amount),
    liability_amount: numberValue(input.liability_amount),
    receivable_amount: numberValue(input.receivable_amount),
    payment_method: input.payment_method || "",
    customer_id: input.customer_id || "",
    customer_name: input.customer_name || "",
    staff_id: input.staff_id || "",
    staff_name: input.staff_name || "",
    order_id: input.order_id || "",
    order_no: input.order_no || "",
    source: input.source || "",
    note: input.note || "",
  };
}

async function maybeRun(query, label) {
  const { data, error } = await query;

  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      return {
        data: [],
        missing: true,
      };
    }

    console.error(`[accounting report] ${label} failed`, error);
    throw new Error(`讀取${label}失敗`);
  }

  return {
    data: data || [],
    missing: false,
  };
}

function orderRows(order) {
  const occurredAt = order.order_finished_at || order.paid_at || order.created_at;
  const amount = numberValue(order.order_amount);
  const staffSalary = numberValue(order.staff_salary);
  const bonusAmount = numberValue(order.bonus_amount);
  const orderNo = order.order_id || String(order.id);
  const service = order.service_name || "陪玩訂單";
  const rows = [];

  if (amount !== 0) {
    rows.push(
      makeRow({
        id: `order-income-${order.id}`,
        occurred_at: occurredAt,
        category: "客人消費",
        subject: "服務收入",
        amount,
        cash_amount: amount,
        revenue_amount: amount,
        customer_name: order.customer_name,
        staff_id: order.discord_id,
        staff_name: order.staff_name,
        order_id: String(order.id),
        order_no: orderNo,
        source: "qiunai_salary_orders",
        note: service,
      })
    );
  }

  if (staffSalary !== 0) {
    rows.push(
      makeRow({
        id: `order-salary-${order.id}`,
        occurred_at: occurredAt,
        category: "員工抽成",
        subject: "薪資 / 佣金",
        amount: staffSalary,
        expense_amount: staffSalary,
        staff_id: order.discord_id,
        staff_name: order.staff_name,
        order_id: String(order.id),
        order_no: orderNo,
        source: "qiunai_salary_orders",
        note: service,
      })
    );
  }

  if (bonusAmount !== 0) {
    rows.push(
      makeRow({
        id: `order-bonus-${order.id}`,
        occurred_at: occurredAt,
        category: "訂單獎金",
        subject: "薪資 / 獎金",
        amount: bonusAmount,
        expense_amount: bonusAmount,
        staff_id: order.discord_id,
        staff_name: order.staff_name,
        order_id: String(order.id),
        order_no: orderNo,
        source: "qiunai_salary_orders",
        note: service,
      })
    );
  }

  return rows;
}

function bonusRow(bonus) {
  const amount = numberValue(bonus.amount);

  return makeRow({
    id: `bonus-${bonus.id}`,
    occurred_at: bonus.created_at,
    category: amount < 0 ? "薪水扣除" : "員工獎金",
    subject: amount < 0 ? "薪資扣除" : "薪資 / 獎金",
    amount,
    expense_amount: amount,
    staff_id: bonus.discord_id,
    staff_name: bonus.staff_name,
    source: "qiunai_staff_bonus",
    note: [bonus.title, bonus.note].filter(Boolean).join("｜"),
  });
}

function withdrawRow(request) {
  const amount = numberValue(request.amount);

  return makeRow({
    id: `withdraw-${request.id}`,
    occurred_at: request.reviewed_at || request.updated_at || request.requested_at,
    category: "提領付款",
    subject: "薪資付款",
    amount,
    cash_amount: -amount,
    staff_id: request.discord_id,
    staff_name: request.staff_name,
    source: "salary_withdraw_requests",
    note: request.request_note || "",
  });
}

function ledgerRow(entry) {
  return makeRow({
    id: `ledger-${entry.id}`,
    occurred_at: entry.occurred_at,
    category: entry.entry_label || entry.entry_type,
    subject: entry.entry_type,
    amount: entry.amount,
    cash_amount: entry.cash_amount,
    revenue_amount: entry.revenue_amount,
    expense_amount: entry.expense_amount,
    discount_amount: entry.discount_amount,
    liability_amount: entry.liability_amount,
    receivable_amount: entry.receivable_amount,
    payment_method: entry.payment_method,
    customer_id: entry.customer_id,
    customer_name: entry.customer_name,
    staff_id: entry.staff_id,
    staff_name: entry.staff_name,
    order_id: entry.order_id,
    order_no: entry.order_no,
    source: entry.source_table || "accounting_ledger",
    note: entry.note,
  });
}

function summarize(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.amount += row.amount;
      summary.cashIn += Math.max(0, row.cash_amount);
      summary.cashOut += Math.abs(Math.min(0, row.cash_amount));
      summary.revenue += row.revenue_amount;
      summary.expense += row.expense_amount;
      summary.discount += row.discount_amount;
      summary.liability += row.liability_amount;
      summary.receivable += row.receivable_amount;
      summary.net = summary.revenue - summary.expense - summary.discount;
      return summary;
    },
    {
      amount: 0,
      cashIn: 0,
      cashOut: 0,
      revenue: 0,
      expense: 0,
      discount: 0,
      liability: 0,
      receivable: 0,
      net: 0,
    }
  );
}

export async function loadQiunaiAccountingReport(
  supabaseAdmin,
  { month, startIso, endIso }
) {
  const range = startIso && endIso ? { month, startIso, endIso } : makeMonthRange(month);

  const [ledgerResult, orderResult, bonusResult, withdrawResult] =
    await Promise.all([
      maybeRun(
        supabaseAdmin
          .from("accounting_ledger")
          .select("*")
          .eq("app_key", "qiunai")
          .gte("occurred_at", range.startIso)
          .lt("occurred_at", range.endIso)
          .order("occurred_at", { ascending: false })
          .limit(5000),
        "會計流水"
      ),
      maybeRun(
        supabaseAdmin
          .from("qiunai_salary_orders")
          .select("*")
          .eq("is_deleted", false)
          .gte("order_finished_at", range.startIso)
          .lt("order_finished_at", range.endIso)
          .order("order_finished_at", { ascending: false })
          .limit(5000),
        "訂單"
      ),
      maybeRun(
        supabaseAdmin
          .from("qiunai_staff_bonus")
          .select("*")
          .gte("created_at", range.startIso)
          .lt("created_at", range.endIso)
          .order("created_at", { ascending: false })
          .limit(5000),
        "獎金扣除"
      ),
      maybeRun(
        supabaseAdmin
          .from("salary_withdraw_requests")
          .select("*")
          .eq("app_key", "qiunai")
          .eq("status", "approved")
          .gte("reviewed_at", range.startIso)
          .lt("reviewed_at", range.endIso)
          .order("reviewed_at", { ascending: false })
          .limit(5000),
        "提領付款"
      ),
    ]);

  const ledgerRows = (ledgerResult.data || [])
    .filter((entry) => LEDGER_REPORT_TYPES.has(entry.entry_type))
    .map(ledgerRow);
  const rows = [
    ...ledgerRows,
    ...(orderResult.data || []).flatMap(orderRows),
    ...(bonusResult.data || []).map(bonusRow),
    ...(withdrawResult.data || []).map(withdrawRow),
  ].sort((a, b) => new Date(b.occurred_at || 0) - new Date(a.occurred_at || 0));

  return {
    range,
    rows,
    summary: summarize(rows),
    ledgerMissing: ledgerResult.missing,
  };
}
