import { createPrivateKey, sign, timingSafeEqual } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const relay = "http://hr-nas-private-relay.railway.internal:8080";
const allowed = new Set(["profiles", "personnel", "documents", "attachment_index", "payroll"]);
const departments = new Set(["qiunai", "deepnight"]);
const discord = /^[0-9]{15,22}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lsn = /^[0-9a-f]{1,8}\/[0-9a-f]{1,8}$/i;

export function hrNasSelected(request, env = process.env) {
  if (request.method !== "GET" || request.headers.get("host")?.toLowerCase().replace(/:\d+$/, "") !== "hr.wearestilllhere.com") return false;
  if (env.HR_NAS_READ_MODE === "live") return true;
  if (env.HR_NAS_READ_MODE !== "canary") return false;
  const expected = Buffer.from(env.HR_NAS_CANARY_SECRET || "");
  const matches = (request.headers.get("cookie") || "").split(";").map(part => part.trim())
    .filter(part => part.startsWith("__Host-hr-nas-canary="));
  if (matches.length !== 1 || expected.length < 32) return false;
  const proof = Buffer.from(matches[0].slice("__Host-hr-nas-canary=".length));
  return expected.length === proof.length && timingSafeEqual(expected, proof);
}

export function makeHrReadClaim(actor, { payroll = [], document } = {}, now = Math.floor(Date.now() / 1000)) {
  if (!discord.test(actor?.discordId) || !Array.isArray(actor.departments)) throw Error("Invalid HR actor");
  const scopes = [...new Set(actor.departments.map(entry => entry.key))];
  if (!scopes.length || scopes.some(key => !departments.has(key))) throw Error("Invalid HR departments");
  const claims = {
    role: "hr_nas_reader", aud: "hr-nas", sub: actor.discordId, iat: now, exp: now + 30,
    departments: scopes,
  };
  if (payroll.length) {
    if (payroll.some(scope => !departments.has(scope.key) || scope.ids.some(id => !discord.test(id)))) throw Error("Invalid payroll scope");
    claims.payroll = Object.fromEntries(payroll.map(scope => [scope.key, [...new Set(scope.ids)]]));
  }
  if (document) {
    if (!scopes.includes(document.department) || !uuid.test(document.id)) throw Error("Invalid HR attachment scope");
    claims.authorized_documents = [document.id];
  }
  return claims;
}

function makeToken(claim) {
  const key = createPrivateKey(Buffer.from(process.env.HR_NAS_SIGNING_PRIVATE_B64 || "", "base64"));
  const payload = [ { alg: "RS256", typ: "JWT", kid: "hr-nas-v1" }, claim ]
    .map(part => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".");
  return payload + "." + sign("RSA-SHA256", Buffer.from(payload), key).toString("base64url");
}

export async function readHrNas(primary, actor, resource, args = {}, scope = {}) {
  if (!allowed.has(resource)) throw Error("Invalid HR replica resource");
  try {
    const signal = AbortSignal.timeout(2400);
    const token = makeToken(makeHrReadClaim(actor, scope));
    const read = async (path, parameters) => {
      const endpoint = new URL("/rpc/" + path, relay);
      endpoint.search = new URLSearchParams(parameters).toString();
      const result = await fetch(endpoint, {
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
        cache: "no-store", redirect: "error", signal,
      });
      if (!result.ok) throw Error("HR replica request failed");
      return result.json();
    };
    const fence = await primary.rpc("eip_primary_read_fence", undefined, { get: true }).retry(false).abortSignal(signal);
    if (fence.error || !lsn.test(fence.data)) throw Error("Invalid HR read fence");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (await read("read_ready", { read_fence: fence.data, resource }) === true) return await read(resource, args);
      if (attempt < 4) await delay(125, undefined, { signal });
    }
    const confirmed = await primary.rpc("eip_primary_read_confirmed", { read_fence: fence.data }, { get: true }).retry(false).abortSignal(signal);
    if (!confirmed.error && confirmed.data === true && await read("read_ready", { read_fence: "0/0", resource }) === true) return await read(resource, args);
    throw Error("HR replica is behind");
  } catch {
    throw Object.assign(Error("HR 資料暫時無法讀取"), { status: 503 });
  }
}

export function hrReadHeaders(resource) {
  return { "Cache-Control": "private, no-store", "X-HR-Replica-Reads": resource, Vary: "Authorization, Cookie" };
}
