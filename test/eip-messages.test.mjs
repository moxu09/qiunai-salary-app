import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const selfId = "1206138511535898654";
const qiunaiPeer = "1552711165954756688";
const deepnightPeer = "1546494242246103090";
const nonce = "763f5bb7-99e6-46b2-8de0-94d29691d915";

function handlers(organization = "qiunai") {
  const calls = [];
  const staff = {
    qiunai_staff: {
      [selfId]: { discord_id: selfId, is_active: true },
      [qiunaiPeer]: { discord_id: qiunaiPeer, is_active: true },
    },
    players: {
      [deepnightPeer]: { discord_id: deepnightPeer, is_active: true },
    },
  };
  const supabaseAdmin = {
    from(table) {
      const filters = {};
      let inserted = null;
      const query = {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        in(key, value) { filters[key] = value; return this; },
        is(key, value) { filters[key] = value; return this; },
        order() { return this; },
        or() { return this; },
        limit() { calls.push({ table, filters: { ...filters } }); return Promise.resolve({ data: [], error: null }); },
        insert(value) { inserted = value; calls.push({ table, inserted: value }); return this; },
        update(value) { calls.push({ table, updated: value, filters }); return this; },
        maybeSingle() { return Promise.resolve({ data: table === "eip_direct_messages" ? null : staff[table]?.[filters.discord_id] || null, error: null }); },
        single() { return Promise.resolve({ data: { id: nonce, ...inserted }, error: null }); },
      };
      return query;
    },
    rpc(_name, _args) { return Promise.resolve({ data: [], error: null }); },
  };
  const source = readFileSync(join(root, "lib/eipMessages.js"), "utf8")
    .replace(/^import .*;\s*$/gm, "")
    .replace("export function createEipMessageHandlers", "function createEipMessageHandlers");
  const context = {
    supabaseAdmin,
    getAuthUserFromRequest: async (_db, request) => {
      if (!request.discordId) throw new Error("not authenticated");
      return { discordId: request.discordId };
    },
    NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) },
    console, URL, Date, Map, Object, String, Number,
  };
  runInNewContext(`${source}\nthis.create = createEipMessageHandlers;`, context);
  return { route: context.create(organization, organization === "qiunai" ? "qiunai_staff" : "players"), calls, staff };
}

function postRequest(discordId, recipientId, extra = {}) {
  return { discordId, text: async () => JSON.stringify({ recipientId, body: "你好，同事！", nonce, ...extra }) };
}

test("only an active authenticated employee may send, and sender/org come from server", async () => {
  const { route, calls } = handlers();
  const response = await route.POST(postRequest(selfId, qiunaiPeer, { sender_discord_id: deepnightPeer, organization_code: "deepnight" }));
  assert.equal(response.status, 201);
  const insert = calls.find((item) => item.inserted).inserted;
  assert.equal(insert.sender_discord_id, selfId);
  assert.equal(insert.recipient_discord_id, qiunaiPeer);
  assert.equal(insert.organization_code, "qiunai");
  assert.equal((await route.POST(postRequest(null, qiunaiPeer))).status, 401);
});

test("self messages, cross-company recipients, and archived staff are blocked", async () => {
  const { route, calls, staff } = handlers();
  assert.equal((await route.POST(postRequest(selfId, selfId))).status, 400);
  assert.equal((await route.POST(postRequest(selfId, deepnightPeer))).status, 404);
  staff.qiunai_staff[selfId].is_active = false;
  assert.equal((await route.POST(postRequest(selfId, qiunaiPeer))).status, 403);
  assert.equal(calls.filter((item) => item.inserted).length, 0);
});

test("thread reads and read receipts stay within the authenticated pair and organization", async () => {
  const { route, calls } = handlers();
  const read = await route.GET({ discordId: selfId, url: `https://local.test/api/qiunai/messages?peer=${qiunaiPeer}` });
  assert.equal(read.status, 200);
  const thread = calls.find((item) => item.table === "eip_direct_messages" && item.filters.sender_discord_id);
  assert.equal(thread.filters.organization_code, "qiunai");
  assert.deepEqual(Array.from(thread.filters.sender_discord_id), [selfId, qiunaiPeer]);
  const receipt = await route.PATCH({ discordId: selfId, text: async () => JSON.stringify({ peerId: qiunaiPeer }) });
  assert.equal(receipt.status, 200);
  const update = calls.find((item) => item.updated);
  assert.equal(update.filters.organization_code, "qiunai");
  assert.equal(update.filters.recipient_discord_id, selfId);
  assert.equal(update.filters.sender_discord_id, qiunaiPeer);
});

test("database migration denies browser roles direct message access", () => {
  const sql = readFileSync(join(root, "supabase/migrations/20260929150000_eip_direct_messages.sql"), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.eip_direct_messages from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.eip_list_conversations\(text, text\) from public, anon, authenticated/i);
  assert.match(sql, /organization_code.*sender_discord_id.*client_nonce/s);
});

test("long staff directories scroll inside the chat instead of hiding the composer", () => {
  const css = readFileSync(join(root, "app/globals.css"), "utf8");
  assert.match(css, /\.eip-messages-layout\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.eip-messages-contacts\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.eip-messages-contact-list\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
});
