import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('heart points follow confirmed payment, each pair, and a single wallet debit', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create table play_orders (
        id uuid primary key default gen_random_uuid(), guild_id text, customer_id text,
        assigned_player text, order_type text, order_item text, order_group_id text,
        channel_id text, final_price numeric, paid boolean, is_deleted boolean,
        status text, customer_name text, customer_username text, game text, service text,
        note text, source_channel_id text, price numeric, paid_at timestamptz,
        salary_paid boolean, completed_at timestamptz, accepted_at timestamptz,
        order_no text, discord_id text, staff_name text, order_amount numeric, staff_salary numeric,
        bonus_amount numeric, salary_rate integer, salary_level text, platform_income numeric,
        platform_expense numeric, order_finished_at timestamptz
      );
      create table users(user_id text primary key, coins integer);
      create table wallet_logs(user_id text, type text, amount numeric, balance numeric, note text);
      create table qiunai_salary_orders(order_id text, discord_id text, staff_name text, customer_name text,
        service_name text, order_amount numeric, staff_salary numeric, bonus_amount numeric,
        salary_rate integer, salary_level text, platform_income numeric, platform_expense numeric,
        status text, order_finished_at timestamptz, is_deleted boolean);
    `);
    const walletSql = await readFile(new URL('../supabase/atomic_money_flow.sql', import.meta.url), 'utf8');
    const walletStart = walletSql.indexOf('create table if not exists public.tip_payment_operations');
    const walletGrant = walletSql.indexOf('grant execute on function public.pay_tip_with_wallet_atomic', walletStart);
    const walletEnd = walletSql.indexOf(';', walletGrant);
    await db.exec(walletSql.slice(walletStart, walletEnd + 1));
    await db.exec(await readFile(new URL('../supabase/migrations/20261103000900_qiunai_heart_gifts.sql', import.meta.url), 'utf8'));

    const guild = '1206138511535898654';
    const buyer = '111111111111111111', first = '222222222222222222', second = '333333333333333333';
    const channel = '444444444444444444', flow = buyer + '_1793683500000';
    const allocations = [
      { staffId: first, amount: 50, item: '貓咪漢堡×1', lines: [{ name: '貓咪漢堡', quantity: 1, points: 50 }] },
      { staffId: second, amount: 120, item: '草莓小蛋糕×1', lines: [{ name: '草莓小蛋糕', quantity: 1, points: 120 }] },
    ];
    await db.query("insert into users values ($1, 130)", [buyer]);
    await db.exec("insert into qiunai_heart_legacy_rows values ('心動值',2,1,'闆闆','陪陪',500)");
    const seed = () => db.query("select qiunai_resolve_heart_opening('心動值',2,1,$1,$2) as total", [buyer, first]);
    assert.equal(Number((await seed()).rows[0].total), 500);
    await db.query("insert into qiunai_heart_checkouts values ($1,$2,$3,$4,'錢包餘額',true,false)",
      [flow, buyer, channel, JSON.stringify(allocations)]);
    const groups = allocations.map(({ item, amount, staffId }) => ({
      item, amount, staff: [{ staff_id: staffId, salary_rate: 90 }],
    }));
    const pay = () => db.query('select qiunai_pay_heart_wallet($1,$2) as result', [flow, JSON.stringify(groups)]);

    // There is enough for the first recipient but not both. No partial payment survives.
    await assert.rejects(pay(), /餘額不足/);
    assert.equal((await db.query('select coins from users')).rows[0].coins, 130);
    assert.equal((await db.query('select id from play_orders')).rows.length, 0);
    await db.exec('update users set coins = 200');
    const paid = (await pay()).rows[0].result;
    assert.equal(paid.balance, 30);
    assert.deepEqual((await pay()).rows[0].result, paid);
    assert.equal((await db.query('select coins from users')).rows[0].coins, 30);
    const events = (await db.query('select staff_id, previous_total, total from qiunai_heart_events order by staff_id')).rows;
    assert.deepEqual(events.map(row => [row.staff_id, Number(row.previous_total), Number(row.total)]),
      [[first, 500, 550], [second, 0, 120]]);
    assert.equal(Number((await seed()).rows[0].total), 550);
    const jobs = (await db.query("select * from qiunai_claim_heart_delivery('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')")).rows;
    assert.equal(jobs.length, 6);
    assert.equal((await db.query("select * from qiunai_claim_heart_delivery('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')")).rows.length, 0);

    // Refund a single recipient twice. Neither the opening value nor the other recipient changes.
    const firstOrder = paid.orders.find(order => order.assigned_player === first);
    for (let retry = 0; retry < 2; retry++) {
      await db.query("update play_orders set paid=false,status='cancelled' where guild_id=$1 and id=$2", [guild, firstOrder.id]);
    }
    assert.equal(Number((await seed()).rows[0].total), 500);
    assert.equal(Number((await db.query('select earned_points from qiunai_heart_pairs where staff_id=$1', [second])).rows[0].earned_points), 120);

    const otherBuyer = '555555555555555555', otherFlow = otherBuyer + '_1793683500001';
    await db.query("insert into qiunai_heart_checkouts values ($1,$2,$3,$4,'綠界支付',false,false)",
      [otherFlow, otherBuyer, channel, JSON.stringify([allocations[0]])]);
    const confirmed = await db.query(`
      insert into play_orders(guild_id,customer_id,assigned_player,order_type,order_item,
          order_group_id,channel_id,final_price,paid,status)
        values ($1,$2,$3,'打賞',$4,$5,$6,50,false,'pending') returning id
    `, [guild, otherBuyer, first, allocations[0].item, 'heart:' + otherFlow, channel]);
    assert.equal((await db.query('select id from qiunai_heart_events where buyer_id=$1', [otherBuyer])).rows.length, 0);
    await db.query("update play_orders set paid=true,status='completed' where id=$1", [confirmed.rows[0].id]);
    assert.equal(Number((await db.query('select earned_points from qiunai_heart_pairs where buyer_id=$1 and staff_id=$2',
      [otherBuyer, first])).rows[0].earned_points), 50);
    assert.equal(Number((await seed()).rows[0].total), 500);
  } finally {
    await db.close();
  }
});
