import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recentRankingMonths } from "../lib/hrRankMonths.mjs";

const source = readFileSync(
  new URL("../app/api/hr/performance-rank/route.js", import.meta.url),
  "utf8",
)
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(/export const dynamic\s*=.*;\n/, "")
  .replace("export async function GET", "async function GET");

function route(departments) {
  const calls = [];
  const GET = new Function(
    "hrAuth", "hrFail", "hrSource", "recentRankingMonths",
    `${source}; return GET;`,
  )(
    async () => ({ discordId: "my-account", departments }),
    (error) => Response.json({ ok: false, message: error.message }, { status: error.status || 400 }),
    async (_request, key, path) => {
      calls.push({ key, path });
      return { ranking: { month: path.split("month=")[1], rank: 2 } };
    },
    recentRankingMonths,
  );
  return { GET, calls };
}

test("historical rank returns only authenticated departments and forwards the selected month", async () => {
  const month = recentRankingMonths()[1];
  const { GET, calls } = route([{ key: "qiunai" }]);
  const response = await GET(new Request(`https://hr.example/api/hr/performance-rank?month=${month}&discordId=other-account`));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ key: "qiunai", path: `performance-rank?month=${month}` }]);
  assert.deepEqual(body.departments.map(({ key }) => key), ["qiunai"]);
  assert.equal(body.departments[0].ranking.rank, 2);
});

test("historical rank rejects months outside the available range", async () => {
  const { GET, calls } = route([{ key: "qiunai" }, { key: "deepnight" }]);
  const response = await GET(new Request("https://hr.example/api/hr/performance-rank?month=2020-01"));
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});
