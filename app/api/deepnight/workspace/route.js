import { createEipWorkspaceHandlers } from "@/lib/eipWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createEipWorkspaceHandlers("deepnight", "players");
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
