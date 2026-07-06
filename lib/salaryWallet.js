const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DEFAULT_WALLET_START_DATE = "2026-07-17";

function getTaipeiParts(date = new Date()) {
  const taipeiDate = new Date(date.getTime() + TAIPEI_OFFSET_MS);

  return {
    year: taipeiDate.getUTCFullYear(),
    month: taipeiDate.getUTCMonth(),
    day: taipeiDate.getUTCDate(),
  };
}

function taipeiToUtcIso(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(Date.UTC(year, month, day, hour - 8, minute, second)).toISOString();
}

function dateText(year, month, day) {
  return [
    String(year).padStart(4, "0"),
    String(month + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function monthText(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function getWalletStartDateText() {
  return process.env.SALARY_WALLET_START_DATE || DEFAULT_WALLET_START_DATE;
}

function getWalletStartIso() {
  return new Date(`${getWalletStartDateText()}T00:00:00+08:00`).toISOString();
}

function getTaipeiDateText(date = new Date()) {
  const { year, month, day } = getTaipeiParts(date);
  return dateText(year, month, day);
}

function getManualSettlement(now = new Date()) {
  const startDateText = getWalletStartDateText();
  const todayText = getTaipeiDateText(now);
  const settlementDate = todayText < startDateText ? startDateText : todayText;
  const startIso = getWalletStartIso();
  const nowIso = now.toISOString();
  const releaseIso = nowIso < startIso ? startIso : nowIso;

  return {
    key: `manual-${settlementDate}`,
    label: `後台手動新增 ${settlementDate}`,
    releaseIso,
    settlementDate,
  };
}

function getLastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function buildPeriod(year, month, half) {
  const firstHalf = half === "H1";
  const startDay = firstHalf ? 1 : 16;
  const endDay = firstHalf ? 15 : getLastDayOfMonth(year, month);
  const releaseYear = firstHalf ? year : new Date(Date.UTC(year, month + 1, 1)).getUTCFullYear();
  const releaseMonth = firstHalf ? month : new Date(Date.UTC(year, month + 1, 1)).getUTCMonth();
  const releaseDay = firstHalf ? 17 : 2;

  return {
    key: `${monthText(year, month)}-${half}`,
    label: `${monthText(year, month)} ${firstHalf ? "1-15" : `16-${endDay}`}`,
    startIso: taipeiToUtcIso(year, month, startDay, 0, 0, 0),
    endIso: taipeiToUtcIso(year, month, endDay, 23, 59, 59),
    releaseIso: taipeiToUtcIso(releaseYear, releaseMonth, releaseDay, 0, 0, 0),
    settlementDate: dateText(releaseYear, releaseMonth, releaseDay),
  };
}

function getDueSettlementPeriods(now = new Date(), monthsBack = 8) {
  const parts = getTaipeiParts(now);
  const periods = [];
  const startDateText = getWalletStartDateText();
  const startTime = new Date(`${startDateText}T00:00:00+08:00`).getTime();

  for (let offset = monthsBack; offset >= 0; offset -= 1) {
    const source = new Date(Date.UTC(parts.year, parts.month - offset, 1));
    const year = source.getUTCFullYear();
    const month = source.getUTCMonth();

    for (const half of ["H1", "H2"]) {
      const period = buildPeriod(year, month, half);
      const releaseTime = new Date(period.releaseIso).getTime();

      if (releaseTime <= now.getTime() && releaseTime >= startTime) {
        periods.push(period);
      }
    }
  }

  return periods;
}

function getWithdrawWindowInfo(now = new Date()) {
  const { day } = getTaipeiParts(now);

  return {
    isOpen: day >= 2 && day <= 10,
    note: "每月 2 到 10 號可以提領，提領需要三個工作天。",
  };
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function sourceLabelFromOrder(order) {
  return (
    order.service_name ||
    order.service ||
    order.order_no ||
    order.order_id ||
    `訂單 ${order.id}`
  );
}

function sourceLabelFromBonus(bonus) {
  return (
    bonus.bonus_type ||
    bonus.title ||
    bonus.description ||
    bonus.note ||
    `獎金 ${bonus.id}`
  );
}

async function upsertWalletEntries(supabaseAdmin, rows) {
  if (!rows.length) return;

  const { error } = await supabaseAdmin
    .from("salary_wallet_entries")
    .upsert(rows, {
      onConflict: "app_key,source_table,source_id,entry_type",
      ignoreDuplicates: true,
    });

  if (error) {
    console.error("[salary wallet] upsert entries failed", error);
    throw new Error("建立薪資錢包入帳紀錄失敗");
  }
}

async function markSettled(supabaseAdmin, table, ids, period) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) return;

  const { error } = await supabaseAdmin
    .from(table)
    .update({
      wallet_settled_at: period.releaseIso,
      wallet_period_key: period.key,
    })
    .in("id", uniqueIds);

  if (error) {
    console.error("[salary wallet] mark settled failed", table, error);
  }
}

function walletEntryKey(table, id, entryType) {
  return `${table}:${String(id)}:${entryType}`;
}

function parseDateStartIso(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toISOString();
}

function parseDateEndIso(value) {
  if (!value) return null;
  return new Date(`${value}T23:59:59`).toISOString();
}

export async function manuallyDepositSalaryWallet(supabaseAdmin, config, params) {
  const discordId = String(params.discordId || "").trim();
  const selectedTypes = new Set(
    (Array.isArray(params.types) ? params.types : [])
      .map((type) => String(type || "").trim())
      .filter(Boolean)
  );

  if (!discordId) {
    throw new Error("缺少員工");
  }

  if (selectedTypes.size === 0) {
    throw new Error("請至少勾選一個發送項目");
  }

  const note = String(params.note || "後台手動新增").trim() || "後台手動新增";
  const startIso = parseDateStartIso(params.startDate);
  const endIso = parseDateEndIso(params.endDate);
  const walletStartIso = getWalletStartIso();
  const pendingWalletFilter =
    `wallet_settled_at.is.null,wallet_settled_at.lt.${walletStartIso}`;

  let orderQuery = supabaseAdmin
    .from(config.orderTable)
    .select(config.orderSelect)
    .eq("discord_id", discordId)
    .or("is_deleted.eq.false,is_deleted.is.null")
    .or(pendingWalletFilter)
    .or("status.neq.已發薪,status.is.null");

  if (config.orderGuildFilter) {
    orderQuery = orderQuery.or(config.orderGuildFilter);
  }

  if (startIso) orderQuery = orderQuery.gte(config.orderDateColumn, startIso);
  if (endIso) orderQuery = orderQuery.lte(config.orderDateColumn, endIso);

  let bonusQuery = supabaseAdmin
    .from(config.bonusTable)
    .select(config.bonusSelect)
    .eq("discord_id", discordId)
    .or(pendingWalletFilter);

  if (startIso) bonusQuery = bonusQuery.gte("created_at", startIso);
  if (endIso) bonusQuery = bonusQuery.lte("created_at", endIso);

  const [{ data: orders, error: orderError }, { data: bonuses, error: bonusError }] =
    await Promise.all([orderQuery, bonusQuery]);

  if (orderError) {
    console.error("[salary wallet] manual load orders failed", orderError);
    throw new Error("讀取待發送訂單失敗");
  }

  if (bonusError) {
    console.error("[salary wallet] manual load bonuses failed", bonusError);
    throw new Error("讀取待發送獎金 / 扣除失敗");
  }

  const sourceIds = [
    ...(orders || []).map((order) => String(order.id)),
    ...(bonuses || []).map((bonus) => String(bonus.id)),
  ];

  const { data: existingEntries, error: existingError } = await supabaseAdmin
    .from("salary_wallet_entries")
    .select("source_table, source_id, entry_type")
    .eq("app_key", config.appKey)
    .in("source_table", [config.orderTable, config.bonusTable])
    .in("source_id", sourceIds.length ? sourceIds : ["__none__"])
    .limit(10000);

  if (existingError) {
    console.error("[salary wallet] manual load existing entries failed", existingError);
    throw new Error("檢查錢包入帳紀錄失敗");
  }

  const existingKeys = new Set(
    (existingEntries || []).map((entry) =>
      walletEntryKey(entry.source_table, entry.source_id, entry.entry_type)
    )
  );
  const nextKeys = new Set(existingKeys);
  const entries = [];
  const manualPeriod = getManualSettlement();
  const sentAt = new Date().toISOString();
  const orderIdsToSettle = [];
  const bonusIdsToSettle = [];

  function pushEntry(row) {
    const key = walletEntryKey(row.source_table, row.source_id, row.entry_type);
    if (nextKeys.has(key)) return false;

    nextKeys.add(key);
    entries.push(row);
    return true;
  }

  for (const order of orders || []) {
    const salaryAmount = numberValue(order.staff_salary);
    const bonusAmount = numberValue(order.bonus_amount);
    const sourceId = String(order.id);
    const sourceLabel = sourceLabelFromOrder(order);
    const isTip = config.isTipOrder ? config.isTipOrder(order) : false;
    const salaryType = isTip ? "tip" : "order";
    const components = [];

    if (salaryAmount !== 0) {
      components.push("order_salary");

      if (selectedTypes.has(salaryType)) {
        pushEntry({
          app_key: config.appKey,
          discord_id: discordId,
          staff_name: order.staff_name || params.staffName || null,
          entry_type: "order_salary",
          amount: salaryAmount,
          source_table: config.orderTable,
          source_id: sourceId,
          source_label: `${isTip ? "打賞薪水" : "訂單薪水"}｜${sourceLabel}｜${note}`,
          period_key: manualPeriod.key,
          settlement_date: manualPeriod.settlementDate,
          metadata: {
            period_label: manualPeriod.label,
            note,
            manual: true,
            selected_type: salaryType,
            admin_discord_id: params.adminDiscordId || null,
            sent_at: sentAt,
          },
        });
      }
    }

    if (bonusAmount !== 0) {
      const bonusType = bonusAmount > 0 ? "bonus" : "deduction";
      components.push("order_bonus");

      if (selectedTypes.has(bonusType)) {
        pushEntry({
          app_key: config.appKey,
          discord_id: discordId,
          staff_name: order.staff_name || params.staffName || null,
          entry_type: "order_bonus",
          amount: bonusAmount,
          source_table: config.orderTable,
          source_id: sourceId,
          source_label: `${bonusAmount > 0 ? "獎金" : "扣除"}｜${sourceLabel}｜${note}`,
          period_key: manualPeriod.key,
          settlement_date: manualPeriod.settlementDate,
          metadata: {
            period_label: manualPeriod.label,
            note,
            manual: true,
            selected_type: bonusType,
            admin_discord_id: params.adminDiscordId || null,
            sent_at: sentAt,
          },
        });
      }
    }

    if (
      components.length > 0 &&
      components.every((entryType) =>
        nextKeys.has(walletEntryKey(config.orderTable, sourceId, entryType))
      )
    ) {
      orderIdsToSettle.push(order.id);
    }
  }

  for (const bonus of bonuses || []) {
    const amount = numberValue(bonus.amount);
    if (amount === 0) continue;

    const sourceId = String(bonus.id);
    const bonusType = amount > 0 ? "bonus" : "deduction";

    if (selectedTypes.has(bonusType)) {
      pushEntry({
        app_key: config.appKey,
        discord_id: discordId,
        staff_name: bonus.staff_name || params.staffName || null,
        entry_type: "staff_bonus",
        amount,
        source_table: config.bonusTable,
        source_id: sourceId,
        source_label: `${amount > 0 ? "獎金" : "扣除"}｜${sourceLabelFromBonus(bonus)}｜${note}`,
        period_key: manualPeriod.key,
        settlement_date: manualPeriod.settlementDate,
        metadata: {
          period_label: manualPeriod.label,
          note,
          manual: true,
          selected_type: bonusType,
          admin_discord_id: params.adminDiscordId || null,
          sent_at: sentAt,
        },
      });
    }

    if (nextKeys.has(walletEntryKey(config.bonusTable, sourceId, "staff_bonus"))) {
      bonusIdsToSettle.push(bonus.id);
    }
  }

  if (!entries.length) {
    throw new Error("沒有可發送到錢包的項目，可能已經發送過了");
  }

  await upsertWalletEntries(supabaseAdmin, entries);
  await markSettled(supabaseAdmin, config.orderTable, orderIdsToSettle, manualPeriod);
  await markSettled(supabaseAdmin, config.bonusTable, bonusIdsToSettle, manualPeriod);

  return {
    count: entries.length,
    amount: entries.reduce((sum, entry) => sum + numberValue(entry.amount), 0),
  };
}

export async function settleSalaryWallet(supabaseAdmin, config) {
  const periods = getDueSettlementPeriods();

  for (const period of periods) {
    let orderQuery = supabaseAdmin
      .from(config.orderTable)
      .select(config.orderSelect)
      .not("discord_id", "is", null)
      .or("is_deleted.eq.false,is_deleted.is.null")
      .is("wallet_settled_at", null)
      .or("status.neq.已發薪,status.is.null")
      .gte(config.orderDateColumn, period.startIso)
      .lte(config.orderDateColumn, period.endIso);

    if (config.orderGuildFilter) {
      orderQuery = orderQuery.or(config.orderGuildFilter);
    }

    const { data: orders, error: orderError } = await orderQuery;

    if (orderError) {
      console.error("[salary wallet] load orders failed", orderError);
      throw new Error("讀取待入帳訂單失敗");
    }

    const orderEntries = [];
    const orderIds = [];

    for (const order of orders || []) {
      const discordId = String(order.discord_id || "").trim();
      if (!discordId) continue;

      const salaryAmount = numberValue(order.staff_salary);
      const bonusAmount = numberValue(order.bonus_amount);
      const sourceId = String(order.id);
      const sourceLabel = sourceLabelFromOrder(order);

      orderIds.push(order.id);

      if (salaryAmount !== 0) {
        orderEntries.push({
          app_key: config.appKey,
          discord_id: discordId,
          staff_name: order.staff_name || null,
          entry_type: "order_salary",
          amount: salaryAmount,
          source_table: config.orderTable,
          source_id: sourceId,
          source_label: sourceLabel,
          period_key: period.key,
          settlement_date: period.settlementDate,
          metadata: {
            period_label: period.label,
          },
        });
      }

      if (bonusAmount !== 0) {
        orderEntries.push({
          app_key: config.appKey,
          discord_id: discordId,
          staff_name: order.staff_name || null,
          entry_type: "order_bonus",
          amount: bonusAmount,
          source_table: config.orderTable,
          source_id: sourceId,
          source_label: `${sourceLabel}｜訂單獎金`,
          period_key: period.key,
          settlement_date: period.settlementDate,
          metadata: {
            period_label: period.label,
          },
        });
      }
    }

    await upsertWalletEntries(supabaseAdmin, orderEntries);
    await markSettled(supabaseAdmin, config.orderTable, orderIds, period);

    const { data: bonuses, error: bonusError } = await supabaseAdmin
      .from(config.bonusTable)
      .select(config.bonusSelect)
      .not("discord_id", "is", null)
      .is("wallet_settled_at", null)
      .gte("created_at", period.startIso)
      .lte("created_at", period.endIso);

    if (bonusError) {
      console.error("[salary wallet] load bonuses failed", bonusError);
      throw new Error("讀取待入帳獎金失敗");
    }

    const bonusEntries = [];
    const bonusIds = [];

    for (const bonus of bonuses || []) {
      const discordId = String(bonus.discord_id || "").trim();
      const amount = numberValue(bonus.amount);
      if (!discordId || amount === 0) continue;

      bonusIds.push(bonus.id);

      bonusEntries.push({
        app_key: config.appKey,
        discord_id: discordId,
        staff_name: bonus.staff_name || null,
        entry_type: "staff_bonus",
        amount,
        source_table: config.bonusTable,
        source_id: String(bonus.id),
        source_label: sourceLabelFromBonus(bonus),
        period_key: period.key,
        settlement_date: period.settlementDate,
        metadata: {
          period_label: period.label,
        },
      });
    }

    await upsertWalletEntries(supabaseAdmin, bonusEntries);
    await markSettled(supabaseAdmin, config.bonusTable, bonusIds, period);
  }
}

export async function getSalaryWalletSummary(supabaseAdmin, appKey, discordId) {
  const startDateText = getWalletStartDateText();
  const [{ data: entries, error: entryError }, { data: requests, error: requestError }] =
    await Promise.all([
      supabaseAdmin
        .from("salary_wallet_entries")
        .select("*")
        .eq("app_key", appKey)
        .eq("discord_id", discordId)
        .gte("settlement_date", startDateText)
        .order("created_at", { ascending: false })
        .limit(120),
      supabaseAdmin
        .from("salary_withdraw_requests")
        .select("*")
        .eq("app_key", appKey)
        .eq("discord_id", discordId)
        .order("requested_at", { ascending: false })
        .limit(20),
    ]);

  if (entryError) {
    console.error("[salary wallet] load entries failed", entryError);
    throw new Error("讀取薪資錢包明細失敗");
  }

  if (requestError) {
    console.error("[salary wallet] load requests failed", requestError);
    throw new Error("讀取提領申請失敗");
  }

  const walletEntries = entries || [];
  const withdrawRequests = requests || [];

  const orderSalary = walletEntries
    .filter((entry) => entry.entry_type === "order_salary")
    .reduce((sum, entry) => sum + numberValue(entry.amount), 0);

  const bonus = walletEntries
    .filter((entry) => entry.entry_type === "order_bonus" || entry.entry_type === "staff_bonus")
    .reduce((sum, entry) => sum + numberValue(entry.amount), 0);

  const deposited = walletEntries.reduce(
    (sum, entry) => sum + numberValue(entry.amount),
    0
  );

  const approvedWithdrawn = withdrawRequests
    .filter((request) => request.status === "approved")
    .reduce((sum, request) => sum + numberValue(request.amount), 0);

  const pendingWithdrawn = withdrawRequests
    .filter((request) => request.status === "pending")
    .reduce((sum, request) => sum + numberValue(request.amount), 0);

  const balance = deposited - approvedWithdrawn;
  const available = deposited - approvedWithdrawn - pendingWithdrawn;
  const withdrawWindow = getWithdrawWindowInfo();

  return {
    totals: {
      orderSalary,
      bonus,
      deposited,
      approvedWithdrawn,
      pendingWithdrawn,
      balance,
      available,
    },
    entries: walletEntries,
    requests: withdrawRequests,
    pendingRequest:
      withdrawRequests.find((request) => request.status === "pending") || null,
    latestRequest: withdrawRequests[0] || null,
    withdrawWindow,
  };
}

export function getDiscordIdFromAuthUser(user) {
  const metadata = user?.user_metadata || {};

  return String(
    metadata.provider_id ||
      metadata.sub ||
      metadata.user_id ||
      user?.identities?.[0]?.identity_data?.provider_id ||
      user?.identities?.[0]?.identity_data?.sub ||
      user?.identities?.[0]?.identity_data?.id ||
      ""
  ).trim();
}

export async function getAuthUserFromRequest(supabaseAdmin, request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw new Error("缺少登入資訊");
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    throw new Error("登入已失效，請重新登入");
  }

  const discordId = getDiscordIdFromAuthUser(data.user);

  if (!discordId) {
    throw new Error("讀取 Discord ID 失敗");
  }

  return {
    user: data.user,
    discordId,
  };
}
