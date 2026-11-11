import { completeHrDocumentSigning, getHrDocumentSigning, hrSigningPdf, requireHrDocumentSigner } from "@/lib/hrDocumentSigning";
import { hrFail } from "@/lib/hrServer";
import { quoteHrCryptoPayout } from "@/lib/hrCryptoMarket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const noStore = { "Cache-Control": "private, no-store" };
const maxSigningBytes = 5 * 1024 * 1024;

async function readSigningBody(request) {
  const tooLarge = () => Object.assign(Error("簽署內容過大"), { status: 413 });
  if (Number(request.headers.get("content-length")) > maxSigningBytes) throw tooLarge();
  const reader = request.body?.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxSigningBytes) {
          await reader.cancel().catch(() => {});
          throw tooLarge();
        }
        chunks.push(value);
      }
    }
    const body = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("Invalid signing body");
    return body;
  } catch (error) {
    if (error.status === 413) throw error;
    throw Object.assign(Error("簽署資料格式不正確"), { status: 400 });
  } finally {
    reader?.releaseLock();
  }
}

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
    const key = new URL(request.url).searchParams.get("document");
    const auth = await requireHrDocumentSigner(request, key);
    const body = await readSigningBody(request);
    if (body.action === "crypto-quote") {
      if (key !== "employment-v22") throw Error("此文件不提供收款試算");
      return Response.json({ ok: true, quote: await quoteHrCryptoPayout(body.asset, body.amountTwd) }, { headers: noStore });
    }
    return Response.json({ ok: true, ...await completeHrDocumentSigning(auth, key, body, request) }, { headers: noStore });
  } catch (error) {
    return hrFail(error);
  }
}
