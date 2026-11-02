import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import { authorizeErpRequest } from "@/lib/erpAccess";
import { createEipInstallerHandlers } from "@/lib/eipAppInstallers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createEipInstallerHandlers({
  db: supabaseAdmin,
  authenticate: (request) => getAuthUserFromRequest(supabaseAdmin, request),
  authorizeAdmin: (request) =>
    authorizeErpRequest(supabaseAdmin, request, "deepnight", "canUploadFiles"),
});
export const GET = handlers.GET;
