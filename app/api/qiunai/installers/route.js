import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import { getQiunaiInstaller, QIUNAI_INSTALLER_BUCKET } from "@/lib/qiunaiInstallers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
    const { data: staff, error: staffError } = await supabaseAdmin
      .from("qiunai_staff")
      .select("id, is_active")
      .eq("discord_id", discordId)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff || staff.is_active === false) {
      return Response.json({ ok: false, message: "只有在職陪陪可以下載安裝包" }, { status: 403 });
    }

    const platform = new URL(request.url).searchParams.get("platform") || "";
    const installer = getQiunaiInstaller(platform);
    if (!installer) {
      return Response.json({ ok: false, message: "不支援的安裝版本" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.storage
      .from(QIUNAI_INSTALLER_BUCKET)
      .createSignedUrl(installer.path, 60, { download: installer.fileName });
    if (error || !data?.signedUrl) throw error || new Error("建立下載連結失敗");

    const upstream = await fetch(data.signedUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      throw new Error(`讀取安裝包失敗：${upstream.status}`);
    }

    const headers = new Headers({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="qiunai-eip-${platform}.zip"; filename*=UTF-8''${encodeURIComponent(installer.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    console.error("qiunai installer download failed", error);
    return Response.json(
      { ok: false, message: "無法建立下載連結，請重新登入或稍後再試" },
      { status: /登入|Discord ID|缺少登入/.test(String(error?.message || "")) ? 401 : 500 }
    );
  }
}
