import { completeHrDocumentSigning, getHrDocumentSigning, hrSigningPdf, requireHrDocumentSigner } from "@/lib/hrDocumentSigning";
import { hrFail } from "@/lib/hrServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const key = params.get("document");
    const auth = await requireHrDocumentSigner(request, key);
    if (params.has("view")) {
      const pdf = await hrSigningPdf(auth, key, params.get("view") === "signed");
      return new Response(pdf, { headers: { ...noStore, "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff" } });
    }
    return Response.json({ ok: true, ...await getHrDocumentSigning(auth, key) }, { headers: noStore });
  } catch (error) {
    return hrFail(error);
  }
}

export async function POST(request) {
  try {
    if (Number(request.headers.get("content-length")) > 4 * 1024 * 1024) {
      throw Object.assign(Error("簽署內容過大"), { status: 413 });
    }
    const key = new URL(request.url).searchParams.get("document");
    const auth = await requireHrDocumentSigner(request, key);
    const body = await request.json();
    return Response.json({ ok: true, ...await completeHrDocumentSigning(auth, key, body, request) }, { headers: noStore });
  } catch (error) {
    return hrFail(error);
  }
}
