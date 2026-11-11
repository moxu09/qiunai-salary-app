import { HR_ORIGIN } from "@/lib/hrThemeServer";

export function GET() {
  return new Response(null, { status: 303, headers: {
    Location: `${HR_ORIGIN}/collaboration/contract-signing?document=employment-v22&deposit=returned`,
    "Cache-Control": "no-store",
  } });
}

export const POST = GET;
