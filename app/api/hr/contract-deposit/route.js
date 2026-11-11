import { requireHrDocumentSigner } from "@/lib/hrDocumentSigning";
import { checkContractDeposit, contractDepositState, startContractDeposit, submitContractDeposit } from "@/lib/hrContractDeposit";
import { hrFail } from "@/lib/hrServer";

export const runtime = "nodejs";
const json = (data) => Response.json(data, { headers: { "Cache-Control": "private, no-store" } });

export async function GET(request) {
  try {
    const { discordId } = await requireHrDocumentSigner(request, "employment-v22");
    return json(await contractDepositState(discordId));
  } catch (error) { return hrFail(error); }
}

export async function POST(request) {
  try {
    const { discordId } = await requireHrDocumentSigner(request, "employment-v22");
    const body = await request.json();
    if (body?.action === "start") return json(await startContractDeposit(discordId, body));
    if (body?.action === "submit") return json(await submitContractDeposit(discordId, body));
    if (body?.action === "check") return json(await checkContractDeposit(discordId));
    return Response.json({ message: "付款操作無效" }, { status: 400 });
  } catch (error) { return hrFail(error); }
}
