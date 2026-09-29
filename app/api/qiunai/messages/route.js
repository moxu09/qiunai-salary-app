import { createEipMessageHandlers } from "@/lib/eipMessages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createEipMessageHandlers("qiunai", "qiunai_staff");
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
