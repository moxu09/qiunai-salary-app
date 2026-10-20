import test from "node:test";
import assert from "node:assert/strict";
import { drawIchibanWithAsd } from "../lib/ichibanAsdDraw.js";

const challengeId = "12345678-1234-4234-8234-123456789012";
const requestId = "87654321-4321-4234-8234-210987654321";
const claimToken = "a".repeat(64);

function database({ identity, draw, identityError = null, drawError = null }) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, "qiunai_ichiban_identity_challenges");
      return {
        select() { return this; }, eq(column, value) { calls.push([column, value]); return this; },
        async maybeSingle() { return { data: identity, error: identityError }; },
      };
    },
    async rpc(name, args) { calls.push([name, args]); return { data: draw, error: drawError }; },
  };
}

test("ASD 一番賞以已驗證 Discord 身分執行單一交易 RPC", async () => {
  const db = database({
    identity: { discord_user_id: "123456789012345678", token_digest: "digest", verified_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString() },
    draw: { draw_id: requestId, prize_id: "f-asd-100", ticket_no: 12, is_last_one: false, balance: 500 },
  });
  const result = await drawIchibanWithAsd(db, () => "digest", { challengeId, claimToken, requestId });
  assert.equal(result.ticket_no, 12);
  assert.deepEqual(db.calls.at(-1), ["qiunai_ichiban_draw_asd", { p_discord_user_id: "123456789012345678", p_request_id: requestId }]);
});

test("ASD 一番賞拒絕過期或不相符的付款身分", async () => {
  const db = database({ identity: { discord_user_id: "123456789012345678", token_digest: "other", verified_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString() } });
  await assert.rejects(() => drawIchibanWithAsd(db, () => "digest", { challengeId, claimToken, requestId }), /Discord 登入已過期/);
  assert.equal(db.calls.some(([name]) => name === "qiunai_ichiban_draw_asd"), false);
});

test("相同 requestId 原樣交給具冪等性的資料庫函式", async () => {
  const db = database({
    identity: { discord_user_id: "123456789012345678", token_digest: "digest", verified_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString() },
    draw: { draw_id: requestId, prize_id: "a-headset", ticket_no: 1, is_last_one: true, already_processed: true },
  });
  const result = await drawIchibanWithAsd(db, () => "digest", { challengeId, claimToken, requestId });
  assert.equal(result.already_processed, true);
  assert.equal(db.calls.at(-1)[1].p_request_id, requestId);
});
