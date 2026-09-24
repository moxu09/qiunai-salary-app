import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const supabaseAnonKey = String(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  ).trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { ok: false, message: "EIP 登入設定尚未完成。" },
      { status: 503 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      supabaseUrl,
      supabaseAnonKey,
      oauthProvider: "discord",
      callbackUrl: "http://127.0.0.1:43821/auth/callback",
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
