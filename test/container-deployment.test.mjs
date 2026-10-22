import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("container build excludes local credentials and generated output", () => {
  const ignore = read(".dockerignore").split("\n");
  for (const entry of [".git", ".env", ".env.*", "node_modules", ".next", "*.pem", "*.key"])
    assert.ok(ignore.includes(entry), `Missing exclusion: ${entry}`);
  assert.ok(!ignore.includes(".github"), "Container regression tests need the workflow source");
});

test("standalone runtime contains Chinese PDF assets and uses non-root server", () => {
  const docker = read("Dockerfile.prebuilt");
  assert.match(docker, /RUN npm test/);
  assert.match(docker, /SUPABASE_SERVICE_ROLE_KEY=build-only-not-a-real-key/);
  assert.doesNotMatch(docker, /(?:ARG|ENV)\s+(?:DISCORD_BOT_TOKEN|CRON_SECRET|SUPABASE_SERVICE_ROLE_KEY)/);
  for (const asset of ["/app/assets", "400-normal.woff", "700-normal.woff", "/app/public", "/app/.next/static"])
    assert.ok(docker.includes(asset));
  assert.match(docker, /USER nextjs/);
  assert.match(docker, /CMD \["node", "server.js"\]/);
  assert.match(read("next.config.ts"), /process\.env\.EIP_CONTAINER_BUILD === "1" \? "standalone" : undefined/);
});

test("CI publishes immutable image only after runtime smoke succeeds", () => {
  const workflow = read(".github/workflows/container-image.yml");
  assert.ok(workflow.indexOf("node scripts/container-smoke.mjs") < workflow.indexOf("docker push"));
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /sha-\$\{GITHUB_SHA\}/);
  assert.doesNotMatch(workflow, /secrets\.(?:SUPABASE_SERVICE_ROLE_KEY|DISCORD_BOT_TOKEN|CRON_SECRET)/);
  assert.doesNotMatch(workflow, /visibility:\s*public|railway.*(?:edit|deploy|up)/);
});
