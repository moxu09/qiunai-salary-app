import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const employee = "1206138511535898654";
const manager = "1552711165954756688";
const documentId = "c14b93bb-1f84-489c-9072-8826a71b3eab";
const documentUrl = `https://local.test/api/qiunai/workspace/files?documentId=${documentId}`;

function setup() {
  const files = [];
  const documents = [{ id: documentId, organization_code: "qiunai", is_published: false }];
  const storage = {
    list(folder) {
      return Promise.resolve({
        data: files.filter((item) => item.path.startsWith(`${folder}/`)).map((item) => ({
          id: item.path, name: item.path.split("/").pop(),
          metadata: { size: item.size }, created_at: "2026-09-29T06:00:00Z",
        })),
        error: null,
      });
    },
    createSignedUrl(path) { return Promise.resolve({ data: { signedUrl: `https://private.test/${path}` }, error: null }); },
  };
  const supabaseAdmin = {
    from(table) {
      const filters = [];
      return {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        maybeSingle() {
          const records = table === "eip_workspace_documents" ? documents : [{ discord_id: employee, is_active: true }];
          return Promise.resolve({ data: records.find((row) => filters.every(([key, value]) => row[key] === value)) || null, error: null });
        },
      };
    },
    storage: { from() { return storage; } },
  };
  const source = readFileSync(join(root, "lib/eipWorkspaceFiles.js"), "utf8")
    .replace(/^import .*;\s*$/gm, "")
    .replace(/import \{[\s\S]*?\} from "@\/lib\/adminFileStorage";\s*/, "")
    .replace("export function createEipWorkspaceFileHandlers", "function createEipWorkspaceFileHandlers");
  const context = {
    supabaseAdmin,
    getAuthUserFromRequest: async (_db, request) => {
      if (!request.discordId) throw new Error("missing");
      return { discordId: request.discordId };
    },
    getErpAccessByDiscordId: async (_db, _org, discordId) => ({
      capabilities: { canViewAllAdmin: discordId === manager },
    }),
    ADMIN_FILE_BUCKET: "salary-admin-files",
    decodedName: (name) => name,
    ensureAdminFileBucket: async () => {},
    validateAdminFile: (file) => {
      if (!file || file.size <= 0 || file.size > 25 * 1024 * 1024 || !file.name.endsWith(".pdf")) throw new Error("不支援此檔案");
    },
    uploadAdminFileBuffer: async ({ organization, category, name, buffer }) => {
      files.push({ path: `${organization}/${category}/new--${name}`, size: buffer.length });
    },
    Response: { json: (body, options = {}) => ({ body, status: options.status || 200 }) },
    console, URL, Date, String, Number, Buffer,
  };
  runInNewContext(`${source}\nthis.create = createEipWorkspaceFileHandlers;`, context);
  return { route: context.create("qiunai", "qiunai_staff"), files, documents };
}

const get = (discordId, suffix = "") => ({ discordId, url: documentUrl + suffix });
const post = (discordId, file, length = "100") => ({
  discordId,
  headers: { get: () => length },
  formData: async () => ({ get: (key) => key === "documentId" ? documentId : file }),
});
const pdf = { name: "manual.pdf", size: 5, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4, 5]).buffer };

test("unpublished attachments and uploads require scoped admin access", async () => {
  const { route, documents, files } = setup();
  assert.equal((await route.GET(get(null))).status, 401);
  assert.equal((await route.GET(get(employee))).status, 404);
  assert.equal((await route.GET(get(employee, "&admin=1"))).status, 403);
  assert.equal((await route.GET(get(manager, "&admin=1"))).status, 200);
  assert.equal((await route.POST(post(employee, pdf))).status, 403);
  assert.equal((await route.POST(post(manager, pdf))).status, 201);
  assert.equal(files.length, 1);
  assert.equal((await route.GET(get(employee))).status, 404);
  documents[0].is_published = true;
  assert.equal((await route.GET(get(employee))).body.files.length, 1);
  documents[0].organization_code = "deepnight";
  assert.equal((await route.GET(get(manager, "&admin=1"))).status, 404);
});

test("download URLs are issued only for files listed under the same document", async () => {
  const { route, files, documents } = setup();
  documents[0].is_published = true;
  const ownPath = `qiunai/workspace/${documentId}/one--manual.pdf`;
  files.push({ path: ownPath, size: 5 });
  assert.equal((await route.GET(get(employee, `&download=${encodeURIComponent("deepnight/workspace/" + documentId + "/secret.pdf")}`))).status, 404);
  const response = await route.GET(get(employee, `&download=${encodeURIComponent(ownPath)}`));
  assert.equal(response.status, 200);
  assert.match(response.body.url, /private\.test/);
  assert.equal((await route.GET(get(employee))).body.files[0].url, undefined);
});

test("file size and per-document count are enforced before upload", async () => {
  const { route, files } = setup();
  assert.equal((await route.POST(post(manager, pdf, String(28 * 1024 * 1024)))).status, 413);
  assert.equal((await route.POST(post(manager, { ...pdf, size: 26 * 1024 * 1024 }))).status, 400);
  for (let index = 0; index < 20; index++) {
    files.push({ path: `qiunai/workspace/${documentId}/${index}--manual.pdf`, size: 5 });
  }
  assert.equal((await route.POST(post(manager, pdf))).status, 400);
});
