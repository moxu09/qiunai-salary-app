import { createHash } from "node:crypto";

export const EIP_INSTALLER_BUCKET = "salary-admin-files";
export const EIP_INSTALLER_PLATFORMS = {
  "macos-arm64": "macOS・Apple Silicon",
  "macos-x64": "macOS・Intel",
  "windows-x64": "Windows・64 位元",
  android: "Android",
};
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export function createEipInstallerHandlers({ db, authenticate, authorizeAdmin }) {
  async function access(request) {
    if (new URL(request.url).searchParams.get("admin") === "1") return authorizeAdmin(request);
    const actor = await authenticate(request);
    const { data, error } = await db.from("players").select("discord_id,is_active").eq("discord_id", actor.discordId).maybeSingle();
    if (error) throw error;
    if (!data || data.is_active === false) throw Object.assign(new Error("只有在職員工可以下載安裝包"), { status: 403 });
    return actor;
  }
  function fail(error) {
    return Response.json({ ok: false, message: error.message || "安裝包服務暫時無法使用" }, { status: Number(error.status) || (/登入|token|JWT|Discord ID/i.test(error.message || "") ? 401 : 500), headers });
  }
  return {
    async GET(request) {
      try {
        await access(request);
        const platform = new URL(request.url).searchParams.get("platform");
        let query = db.from("eip_app_installers").select("platform,version,filename,size,sha256,path,published_at").eq("organization_code", "deepnight");
        if (!platform) {
          const { data, error } = await query.order("platform");
          if (error) throw error;
          return Response.json({ ok: true, files: (data || []).map((file) => ({ platform: file.platform, version: file.version, filename: file.filename, size: file.size, sha256: file.sha256, published_at: file.published_at })) }, { headers });
        }
        if (!Object.hasOwn(EIP_INSTALLER_PLATFORMS, platform)) throw Object.assign(new Error("不支援的安裝版本"), { status: 400 });
        const { data: file, error } = await query.eq("platform", platform).maybeSingle();
        if (error) throw error;
        if (!file) throw Object.assign(new Error("此平台尚未發布安裝包"), { status: 404 });
        if (!file.path.startsWith(`deepnight/installers/${platform}/`) || file.path.includes("..")) throw new Error("安裝包路徑不正確");
        const result = await db.storage.from(EIP_INSTALLER_BUCKET).download(file.path);
        if (result.error || !result.data) throw new Error("找不到安裝包，請聯繫管理員重新發布");
        const bytes = Buffer.from(await result.data.arrayBuffer());
        if (bytes.length !== Number(file.size) || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("安裝包完整性驗證失敗");
        return new Response(bytes, { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length), "Content-Disposition": `attachment; filename="deepnight-eip-${platform}${platform === "windows-x64" ? ".exe" : platform === "android" ? ".apk" : ".zip"}"; filename*=UTF-8''${encodeURIComponent(file.filename)}` } });
      } catch (error) { return fail(error); }
    },
    async POST(request) {
      let path = "";
      try {
        const actor = await authorizeAdmin(request);
        if (Number(request.headers.get("content-length") || 0) > 51 * 1024 * 1024) throw Object.assign(new Error("安裝包最多 50 MB"), { status: 413 });
        const form = await request.formData();
        const platform = String(form.get("platform") || "");
        const version = String(form.get("version") || "").trim();
        const file = form.get("file");
        if (!Object.hasOwn(EIP_INSTALLER_PLATFORMS, platform) || !/^\d+\.\d+\.\d+(?:[-.][a-zA-Z0-9.]+)?$/.test(version)) throw Object.assign(new Error("請選擇平台並輸入有效版本號，例如 1.0.0"), { status: 400 });
        const extension = platform === "windows-x64" ? ".exe" : platform === "android" ? ".apk" : ".zip";
        if (!file || typeof file.arrayBuffer !== "function" || file.size < 1024 || file.size > 50 * 1024 * 1024 || !file.name.toLowerCase().endsWith(extension) || /[\\/\r\n\u0000]/.test(file.name)) throw Object.assign(new Error(`請上傳非空的 ${extension} 安裝包，單檔最多 50 MB`), { status: 400 });
        const bytes = Buffer.from(await file.arrayBuffer());
        if (platform === "windows-x64" ? bytes[0] !== 77 || bytes[1] !== 90 : bytes[0] !== 80 || bytes[1] !== 75) throw Object.assign(new Error("安裝包內容與副檔名不符"), { status: 400 });
        const objectPath = `deepnight/installers/${platform}/${crypto.randomUUID()}${extension}`;
        const upload = await db.storage.from(EIP_INSTALLER_BUCKET).upload(objectPath, bytes, { contentType: "application/octet-stream", upsert: false });
        if (upload.error) throw upload.error;
        path = objectPath;
        const { error } = await db.from("eip_app_installers").upsert({ organization_code: "deepnight", platform, version, path, filename: file.name, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), published_by: actor.discordId, published_at: new Date().toISOString() }, { onConflict: "organization_code,platform" });
        if (error) throw error;
        return Response.json({ ok: true }, { status: 201, headers });
      } catch (error) {
        if (path) await db.storage.from(EIP_INSTALLER_BUCKET).remove([path]);
        return fail(error);
      }
    },
  };
}
