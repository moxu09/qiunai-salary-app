const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { getMonthlyOrderAmount } = require('../lib/creditedSalaryCommission');
const root = path.resolve(__dirname, '..');
function dbFor(rows, tier = 'auto') {
  const writes = [];
  return { writes, from(table) {
    let data = rows.slice(); let patch;
    const q = {
      select() { return q; }, eq(k, v) { data = data.filter(r => r[k] === v); return q; },
      or() { data = data.filter(r => r.is_deleted !== true); return q; },
      gte(k, v) { data = data.filter(r => r[k] >= v); return q; },
      lt(k, v) { data = data.filter(r => r[k] < v); return q; },
      lte() { return q; }, gt() { return q; }, order() { return q; },
      range: async (a, b) => ({ data: data.slice(a, b + 1), error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: table === 'qiunai_staff' ? { discord_id: 'staff', commission_tier: tier }
        : { id: 'pending', discord_id: 'staff', order_amount: 1000, order_finished_at: '2026-10-21T00:00:00Z',
          service_name: '語聊', admin_note: '{}' }, error: null }),
      update(p) { patch = p; return q; },
      then(resolve) { if (patch) writes.push(patch); return Promise.resolve({ data: [], error: null }).then(resolve); },
    }; return q;
  } };
}
const row = (order_amount, date, extra = {}) => ({ discord_id: 'staff', order_amount, staff_salary: Math.round(order_amount * .8),
  status: '已入帳', is_deleted: false, order_finished_at: date, ...extra });
function reviewFunction() {
  const source = fs.readFileSync(path.join(root, 'lib/workReportReview.js'), 'utf8')
    .replace(/^import .*;\s*$/gm, '').replace('export async function reviewWorkReport', 'async function reviewWorkReport');
  const context = { module: { exports: {} }, getMonthlyOrderAmount };
  vm.runInNewContext(source + '\nmodule.exports = reviewWorkReport;', context);
  return context.module.exports;
}
test('小嵐回歸：歷史25102不能算成本月進度，排除700待審核後為7270', async () => {
  const db = dbFor([row(1035, '2026-07-10T00:00:00Z'), row(5830, '2026-08-10T00:00:00Z'),
    row(10267, '2026-09-10T00:00:00Z'), row(7270, '2026-10-10T00:00:00Z'),
    row(700, '2026-10-20T00:00:00Z', { status: '工時待審核' })]);
  assert.equal(await getMonthlyOrderAmount(db, 'staff', '2026-10-21T00:00:00Z'), 7270);
  assert.equal(await getMonthlyOrderAmount(db, 'staff', '2026-10-21T00:00:00Z', -1), 10267);
  assert.equal(await getMonthlyOrderAmount(db, 'staff', '2026-11-01T00:00:00+08:00'), 0);
});
test('工時核准以各月獨立業績決定85%，不是歷史累積永久升級', async () => {
  for (const [sep, expected] of [[10000, 85], [9999, 80], [0, 80]]) {
    const db = dbFor([row(50000, '2026-08-01T00:00:00Z'), row(sep, '2026-09-10T00:00:00Z'),
      row(50000, '2026-10-01T00:00:00Z')]);
    const result = await reviewFunction()(db, 'qiunai', { id: 'pending', action: 'approve' }, 'reviewer');
    assert.equal(result.salaryRate, expected); assert.equal(result.staffSalary, expected * 10);
    assert.equal(db.writes.length, 1);
  }
});
test('保留人工檔位與去年薪資達標的年度90%', async () => {
  for (const [tier, rows, expected] of [['manager_95', [], 95], ['rate_80', [row(50000, '2026-09-10T00:00:00Z')], 80],
    ['auto', [row(125000, '2025-12-15T00:00:00Z')], 90]]) {
    const db = dbFor(rows, tier);
    const result = await reviewFunction()(db, 'qiunai', { id: 'pending', action: 'approve' }, 'reviewer');
    assert.equal(result.salaryRate, expected);
  }
});
test('查詢失敗不得當零業績', async () => {
  const db = dbFor([]); const from = db.from;
  db.from = table => { const q = from(table); q.range = async () => ({ error: Error('database unavailable') }); return q; };
  await assert.rejects(getMonthlyOrderAmount(db, 'staff', '2026-10-21'), /database unavailable/);
});
test('員工進度不得回到歷史累積或被最後一筆打賞抽成覆蓋；人工新增與審核也讀上月業績', () => {
  const staff = fs.readFileSync(path.join(root, 'app/staff/page.tsx'), 'utf8');
  assert.match(staff, /current=\{commissionInfo.monthlyCreditedSalary\}/);
  assert.doesNotMatch(staff, /latestOrderWithRate|function is85ActiveThisMonth|commissionInfo.totalOrderAmount/);
  const admin = fs.readFileSync(path.join(root, 'app/admin/salary/page.tsx'), 'utf8');
  assert.match(admin, /const defaultRate = await getStaffSalaryRate/);
  assert.match(admin, /const regularRate = await getStaffSalaryRate/);
  assert.match(admin, /getMonthlyOrderAmount\(supabase, staff.discord_id, at, -1\)/);
});
