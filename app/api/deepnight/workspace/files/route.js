import { createEipWorkspaceFileHandlers } from "@/lib/eipWorkspaceFiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createEipWorkspaceFileHandlers("deepnight", "players");
export const GET = handlers.GET;
export const POST = handlers.POST;
