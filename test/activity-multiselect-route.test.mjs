import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import ExcelJS from "exceljs";
import { groupActivityResponses } from "../lib/qiunaiActivityGroups.ts";
import { activityOccupied, checkActivityCapacityEdit, parseActivityCapacity } from "../lib/activityCapacity.mjs";
import { normalizeActivityOptionIds } from "../lib/activityOptionSelection.js";

class NextResponse extends Response {
  static json(value, options) {
    return new NextResponse(JSON.stringify(value), { ...options, headers: { "Content-Type": "application/json" } });
  }
}

function database(tables) {
  const calls = [], writes = [];
  return {
    calls, writes,
    async rpc(name, args) {
      assert.equal(name, "submit_qiunai_activity_response");
      writes.push({ operation: name, args });
      return { data: { id: "new-response" }, error: null };
    },
    from(table) {
      const entry = { table, columns: "*", filters: [], single: false };
      calls.push(entry);
      function result() {
        let rows = tables[table] || [];
        for (const [kind, key, value] of entry.filters) {
          rows = rows.filter(row => kind === "in" ? value.includes(row[key]) : row[key] === value);
        }
        if (entry.operation === "upsert") rows = [{ id: "new-response", ...entry.value }];
        if (entry.columns !== "*") rows = rows.map(row => Object.fromEntries(entry.columns.split(",").map(key => [key, row[key]])));
        return { data: entry.single ? rows[0] || null : rows, error: null, count: rows.length };
      }
      const builder = {
        select(columns = "*") { entry.columns = columns; return this; },
        eq(key, value) { entry.filters.push(["eq", key, value]); return this; },
        in(key, value) { entry.filters.push(["in", key, value]); return this; },
        order() { return this; },
        or() { return this; },
        maybeSingle() { entry.single = true; return Promise.resolve(result()); },
        single() { entry.single = true; return Promise.resolve(result()); },
        upsert(value) { entry.operation = "upsert"; entry.value = value; writes.push(entry); return this; },
        update(value) { entry.operation = "update"; entry.value = value; writes.push(entry); return this; },
        delete() { entry.operation = "delete"; writes.push(entry); return this; },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return builder;
    },
  };
}

async function routes(db, authorize = async () => ({ discordId: "staff" }), authorizeEditor = authorize) {
  async function load(file, names) {
    const source = (await fs.readFile(new URL(file, import.meta.url), "utf8"))
      .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
    return new Function("ExcelJS", "NextResponse", "supabaseAdmin", "requireHrPic",
      "groupActivityResponses", "getAuthUserFromRequest", "normalizeActivityOptionIds",
      "requireHrActivityEditor", "activityOccupied", "checkActivityCapacityEdit", "parseActivityCapacity",
      source + "\nreturn {" + names.join(",") + "};")(
      ExcelJS, NextResponse, db, authorize, groupActivityResponses,
      async () => ({ discordId: "staff" }), normalizeActivityOptionIds,
      authorizeEditor, activityOccupied, checkActivityCapacityEdit, parseActivityCapacity,
    );
  }
  return {
    exportRoute: await load("../app/api/qiunai/activities/[id]/export/route.js", ["GET"]),
    activityRoute: await load("../app/api/qiunai/activities/route.js", ["GET", "POST", "PATCH", "DELETE"]),
  };
}

function fixture() {
  return {
    qiunai_activities: [{
      id: "activity", title: "複選測試", starts_at: "2099-11-15T04:30:00Z",
      response_deadline: "2099-11-14T04:30:00Z", allow_multiple_options: true,
      is_published: true, allow_not_attending: true, allow_distance: true,
      min_completed_orders: 0, min_employment_days: 0,
    }],
    qiunai_activity_options: [
      { id: "n", activity_id: "activity", label: "台北" },
      { id: "c", activity_id: "activity", label: "台中" },
      { id: "s", activity_id: "activity", label: "高雄" },
    ],
    qiunai_activity_responses: [
      { id: "multi", activity_id: "activity", discord_id: "staff", response_status: "attending", selected_option_id: "n", selected_option_ids: ["n", "c", "s"], staff_nickname: "複選員工" },
      { id: "single", activity_id: "activity", response_status: "attending", selected_option_id: "c", selected_option_ids: [], staff_nickname: "單選員工" },
      { id: "declined", activity_id: "activity", response_status: "not_attending", staff_nickname: "不參加員工" },
    ],
    qiunai_activity_guests: [{ response_id: "multi", slot: 1, guest_name: "同行親友", guest_phone: "測試電話" }],
    qiunai_staff: [{ discord_id: "staff", is_active: true, created_at: "2020-01-01", display_name: "測試員工" }],
    qiunai_salary_orders: [],
  };
}

const request = body => new Request("https://example.test/api/qiunai/activities", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

test("實際 Excel route 逐場列出複選員工與親友，總人數不重複", async () => {
  const db = database(fixture());
  const { exportRoute } = await routes(db);
  const response = await exportRoute.GET(new Request("https://example.test/export"), { params: Promise.resolve({ id: "activity" }) });
  assert.equal(response.status, 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const sheet = workbook.worksheets[0];
  const values = sheet.getColumn(1).values;
  assert.ok(values.includes("台北（1 人）"));
  assert.ok(values.includes("台中（2 人）"));
  assert.ok(values.includes("高雄（1 人）"));
  assert.equal(values.filter(v => v === "複選員工").length, 3);
  assert.equal(values.filter(v => v === "單選員工").length, 1);
  assert.equal(sheet.getColumn(4).values.filter(v => v === "同行親友").length, 3);
  assert.equal(sheet.getCell("A3").value, "回覆總數：3 人");
  assert.match(sheet.getCell("B3").value, /不重複/);
  assert.equal(sheet.pageSetup.paperSize, 9);
  assert.equal(sheet.pageSetup.orientation, "landscape");
  assert.equal(db.writes.length, 0);
});

test("匯出仍要求秋奈後台權限，拒絕時不讀取名單", async () => {
  const db = database(fixture());
  const { exportRoute } = await routes(db, async () => { throw new Error("無權限"); });
  const response = await exportRoute.GET(new Request("https://example.test/export"), { params: { id: "activity" } });
  assert.equal(response.status, 400);
  assert.equal(db.calls.length, 0);
});

test("實際編輯 route 阻止關閉有歷史複選的活動，資料完全不寫入", async () => {
  const db = database(fixture());
  const { activityRoute } = await routes(db);
  const response = await activityRoute.PATCH(request({ action: "edit", id: "activity", allowMultipleOptions: false }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /已有員工提交複選/);
  assert.equal(db.writes.length, 0);
});

test("實際回覆 route 拒絕舊頁面縮減既有複選，不刪除親友", async () => {
  const db = database(fixture());
  const { activityRoute } = await routes(db);
  const response = await activityRoute.PATCH(request({ action: "respond", activityId: "activity", status: "attending", optionId: "n" }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /頁面版本過舊/);
  assert.equal(db.writes.length, 0);
});

test("實際回覆 route 將全部場次交由資料庫一次儲存", async () => {
  const db = database(fixture());
  const { activityRoute } = await routes(db);
  const response = await activityRoute.PATCH(request({ action: "respond", activityId: "activity", status: "attending", optionIds: ["s", "n", "c"], guests: [] }));
  assert.equal(response.status, 200);
  assert.equal(db.writes.length, 1);
  assert.equal(db.writes[0].operation, "submit_qiunai_activity_response");
  assert.deepEqual(db.writes[0].args.p_option_ids, ["n", "c", "s"]);
});

test("複選修正仍遵守報名截止，不寫入已截止活動", async () => {
  const tables = fixture();
  tables.qiunai_activities[0].response_deadline = "2020-01-01T00:00:00Z";
  const db = database(tables);
  const { activityRoute } = await routes(db);
  const response = await activityRoute.PATCH(request({ action: "respond", activityId: "activity", status: "attending", optionIds: ["n", "c"] }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /報名已截止/);
  assert.equal(db.writes.length, 0);
});


test("本店 Manager 能讀取並編輯活動，編輯資料不含名單且不能切換發布狀態", async () => {
  const db = database(fixture());
  const { activityRoute } = await routes(db,
    async () => { throw Object.assign(new Error("只有 PIC 可以執行此操作"), { status: 403 }); },
    async (_, organization) => {
      assert.equal(organization, "qiunai");
      return { canManageActivity: false };
    },
  );
  const list = await activityRoute.GET(new Request("https://example.test/api/qiunai/activities?admin=1"));
  assert.equal(list.status, 200);
  const payload = await list.json();
  assert.equal(payload.activities.length, 1);
  assert.equal(payload.canManageActivity, false);
  assert.equal(db.calls.some(call => call.table.endsWith("_responses") || call.table.endsWith("_guests")), false);

  const response = await activityRoute.PATCH(request({
    action: "edit", id: "activity", title: "改活動", startsAt: "2099-11-15T04:30:00Z",
    isPublished: false, capacity: null, options: fixture().qiunai_activity_options,
  }));
  assert.equal(response.status, 200);
  const edit = db.writes.find(call => call.table === "qiunai_activities");
  assert.equal(edit.value.title, "改活動");
  assert.equal(Object.hasOwn(edit.value, "is_published"), false);

  const publish = await activityRoute.PATCH(request({ action: "publish", id: "activity", isPublished: false }));
  assert.equal(publish.status, 403);
});

test("活動編輯使用本店 HR 角色，拒絕其他店主管及未登入者", async () => {
  const source = (await fs.readFile(new URL("../lib/hrAccess.js", import.meta.url), "utf8"))
    .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
  const db = { async rpc(name, { p_org, p_actor }) {
    assert.equal(name, "hr_salary_reviewer_role");
    return { data: p_actor === "owner" ? "PIC" : p_org === "deepnight" && p_actor === "manager" ? "Manager" : "Staff" };
  } };
  const requireEditor = new Function("supabaseAdmin", "ERP_OWNER_DISCORD_ID", "getAuthUserFromRequest",
    source + "\nreturn requireHrActivityEditor;")(db, "owner", async (_, actor) => {
      if (!actor) throw Error("登入失效");
      return { discordId: actor };
    });
  assert.equal((await requireEditor("manager", "deepnight")).canManageActivity, false);
  assert.equal((await requireEditor("owner", "qiunai")).canManageActivity, true);
  await assert.rejects(requireEditor("manager", "qiunai"), { status: 403 });
  await assert.rejects(requireEditor("staff", "deepnight"), { status: 403 });
  await assert.rejects(requireEditor(null, "deepnight"), { status: 401 });
});
