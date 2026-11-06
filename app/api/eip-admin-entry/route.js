import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import { ERP_OWNER_DISCORD_ID, getErpAccessByDiscordId } from "@/lib/erpAccess";
import { eipAdminDestination } from "@/lib/eipAdminDestination.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!/^Bearer\s+\S+$/i.test(request.headers.get("authorization") || "")) {
    return Response.json({ message: "請先登入 EIP" }, { status: 401, headers });
  }
  try {
    const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
    const [deepnight, qiunai] = await Promise.all([
      getErpAccessByDiscordId(supabaseAdmin, "deepnight", discordId),
      getErpAccessByDiscordId(supabaseAdmin, "qiunai", discordId),
    ]);
    return Response.json(eipAdminDestination(deepnight, qiunai, discordId === ERP_OWNER_DISCORD_ID), { headers });
  } catch {
    return Response.json({ message: "目前無法確認後台權限，請重試或重新登入。" }, { status: 503, headers });
  }
}
