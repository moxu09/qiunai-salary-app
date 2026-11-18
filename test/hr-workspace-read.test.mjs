import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../app/api/hr/workspace/route.js", import.meta.url), "utf8")
  .replace(/^import .*;$/gm, "").replaceAll("export ", "");

function setup() {
  const reads = new Map();
  const actor = { discordId: "employee", departments: [{ key: "qiunai" }, { key: "deepnight" }] };
  function defer(name) {
    const { promise, resolve, reject } = Promise.withResolvers();
    reads.set(name, { resolve, reject });
    return promise;
  }
  const handler = runInNewContext(`${source}\nGET`, {
    URL, Response, performance,
    hrAuth: async () => actor,
    hrNasSelected: () => true,
    hrReadHeaders: (reads) => ({ "X-HR-Replica-Reads": reads }),
    hrFail: (error) => Response.json({ ok: false }, { status: error.status }),
    getHrSigningTasks: () => defer("signing"),
    privateCourseCatalog: (key) => defer(`courses:${key}`),
    supabaseAdmin: {},
    readHrNas: (_client, auth, resource, args) => {
      assert.equal(auth, actor);
      return defer(args ? `${resource}:${args.department}` : resource);
    },
    hrSource: (_request, key, path, { skipEmployeeDocuments }) => {
      assert.equal(path, "workspace");
      assert.equal(skipEmployeeDocuments, true);
      return defer(`workspace:${key}`);
    },
    annotate: (rows, organization) => (rows || []).map((row) => ({ ...row, organization })),
  });
  return { reads, response: handler(new Request("https://hr.wearestilllhere.com/api/hr/workspace")) };
}

test("independent workspace reads overlap, preserve department order, and tolerate only course failures", async () => {
  const { reads, response } = setup();
  await setImmediate();
  assert.equal(reads.size, 8);
  reads.get("workspace:deepnight").resolve({ templates: [{ id: "second" }] });
  reads.get("workspace:qiunai").resolve({ templates: [{ id: "first" }] });
  reads.get("courses:deepnight").reject(Error("course lookup unavailable"));
  for (const [name, pending] of reads) {
    if (!name.startsWith("workspace:") && name !== "courses:deepnight") pending.resolve([]);
  }
  const result = await response;
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("X-HR-Replica-Reads"), "personnel,documents");
  assert.match(result.headers.get("Server-Timing"), /documents1;dur=\d+/);
  const data = await result.json();
  assert.deepEqual(data.templates.map(({ id }) => id), ["first", "second"]);
  assert.equal(data.serviceCoursesUnavailable, true);
});

test("a failed NAS read fails the workspace request", async () => {
  const { reads, response } = setup();
  await setImmediate();
  reads.get("documents:qiunai").reject(Object.assign(Error("replica timeout"), { status: 503 }));
  assert.equal((await response).status, 503);
});
