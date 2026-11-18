import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";
import { hrNasSelected, hrReadHeaders, makeHrReadClaim, readHrNas } from "../lib/hrNasRead.mjs";

const actor = { discordId: "111111111111111", departments: [{ key: "qiunai" }] };
const canary = "synthetic-canary-f46b772f13279858e9ef";
function req(host, method = "GET", cookie = "") {
  return new Request("https://hr.wearestilllhere.com/api/hr/orders", { method, headers: { host, cookie } });
}

test("the canary is only a read switch for the exact HR authority", () => {
  const env = { HR_NAS_READ_MODE: "canary", HR_NAS_CANARY_SECRET: canary };
  const cookie = "__Host-hr-nas-canary=" + canary;
  assert.equal(hrNasSelected(req("hr.wearestilllhere.com", "GET", cookie), env), true);
  assert.equal(hrNasSelected(req("hr.wearestilllhere.com", "GET"), env), false);
  assert.equal(hrNasSelected(req("eip.wearestilllhere.com", "GET", cookie), env), false);
  assert.equal(hrNasSelected(req("hr.wearestilllhere.com", "PATCH", cookie), env), false);
  assert.equal(hrNasSelected(req("hr.wearestilllhere.com", "GET", cookie + "; " + cookie), env), false);
  assert.equal(hrNasSelected(req("hr.wearestilllhere.com", "GET"), { HR_NAS_READ_MODE: "live" }), true);
  assert.equal(hrReadHeaders("profiles")["Cache-Control"], "private, no-store");
});

test("claims use the employee and verified financial scopes provided by the server", () => {
  const claims = makeHrReadClaim(actor, { payroll: [{ key: "qiunai", ids: [actor.discordId, actor.discordId] }] }, 100);
  assert.deepEqual(claims.departments, ["qiunai"]);
  assert.deepEqual(claims.payroll.qiunai, [actor.discordId]);
  assert.equal(claims.sub, actor.discordId);
  assert.equal(claims.exp, 130);
  assert.throws(() => makeHrReadClaim(actor, { document: { department: "deepnight", id: "8430e696-6fd7-4e2d-a2a9-b1ed55a14f68" } }));
  assert.throws(() => makeHrReadClaim(actor, { payroll: [{ key: "erp", ids: [actor.discordId] }] }));
});

test("the primary WAL fence is sampled before any authenticated NAS data read", async t => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const prior = process.env.HR_NAS_SIGNING_PRIVATE_B64;
  process.env.HR_NAS_SIGNING_PRIVATE_B64 = Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" })).toString("base64");
  t.after(() => {
    if (prior === undefined) delete process.env.HR_NAS_SIGNING_PRIVATE_B64;
    else process.env.HR_NAS_SIGNING_PRIVATE_B64 = prior;
  });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const [tokenHeader, tokenClaims, signature] = options.headers.Authorization.slice(7).split(".");
    const signed = Buffer.from(tokenHeader + "." + tokenClaims);
    assert.ok(verify("RSA-SHA256", signed, publicKey, Buffer.from(signature, "base64url")));
    assert.equal(JSON.parse(Buffer.from(tokenClaims, "base64url")).sub, actor.discordId);
    assert.equal(url.hostname, "hr-nas-private-relay.railway.internal");
    assert.equal(options.redirect, "error");
    calls.push(url.pathname);
    if (url.pathname.endsWith("read_ready")) assert.equal(url.searchParams.get("read_fence"), "1/2");
    return Response.json(url.pathname.endsWith("read_ready") ? true : [{ display_name: "fixture" }]);
  });
  const primary = { rpc(name) {
    calls.push(name);
    return { retry() { return this; }, abortSignal: async () => ({ error: null, data: "1/2" }) };
  } };
  assert.deepEqual(await readHrNas(primary, actor, "profiles"), [{ display_name: "fixture" }]);
  assert.deepEqual(calls, ["eip_primary_read_fence", "/rpc/read_ready", "/rpc/profiles"]);
  await assert.rejects(readHrNas(primary, actor, "unsafe"));
});
