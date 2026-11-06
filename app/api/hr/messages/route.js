import { hrAuth, hrFail } from "@/lib/hrServer";
import { hrSource } from "@/lib/hrUpstream";
export const dynamic = "force-dynamic";
async function contactSources(request, departments, peer) {
  const sources = [];
  const contacts = new Map();
  for (const { key } of departments) {
    const data = await hrSource(request, key, "messages");
    for (const contact of data.contacts || []) {
      if (contact.discordId === peer) sources.push(key);
      const old = contacts.get(contact.discordId);
      const newest = old && String(old.lastAt || "") > String(contact.lastAt || "") ? old : contact;
      contacts.set(contact.discordId, {
        ...newest,
        unreadCount: (old?.unreadCount || 0) + contact.unreadCount,
        departments: [...(old?.departments || []), key],
      });
    }
  }
  return {
    contacts: [...contacts.values()].sort((a, b) =>
      String(b.lastAt || "").localeCompare(String(a.lastAt || "")),
    ),
    sources,
  };
}
export async function GET(request) {
  try {
    const { departments } = await hrAuth(request);
    const peer = new URL(request.url).searchParams.get("peer");
    const { contacts, sources } = await contactSources(request, departments, peer);
    if (!peer)
      return Response.json({ ok: true, contacts }, { headers: { "Cache-Control": "no-store" } });
    if (!sources.length) throw Object.assign(Error("無權讀取此對話"), { status: 403 });
    const messages = [];
    for (const key of sources) {
      const data = await hrSource(request, key, `messages?peer=${encodeURIComponent(peer)}`);
      messages.push(...(data.messages || []).map((m) => ({ ...m, organization: key })));
    }
    messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return Response.json({ ok: true, messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return hrFail(error);
  }
}
async function mutate(request) {
  try {
    const { departments } = await hrAuth(request);
    const body = await request.json();
    const { sources } = await contactSources(
      request,
      departments,
      request.method === "POST" ? body.recipientId : body.peerId,
    );
    if (!sources.length) throw Object.assign(Error("此同事不在你的部門通訊錄中"), { status: 403 });
    if (request.method === "PATCH") {
      for (const key of sources)
        await hrSource(request, key, "messages", { method: "PATCH", body });
      return Response.json({ ok: true });
    }
    // Replies follow the department of the most recent message, preserving its original scope.
    let destination = sources[0],
      latest = "";
    for (const key of sources) {
      const data = await hrSource(
        request,
        key,
        `messages?peer=${encodeURIComponent(body.recipientId)}`,
      );
      const last = data.messages?.at(-1);
      if (last?.created_at > latest) {
        latest = last.created_at;
        destination = key;
      }
    }
    return Response.json(
      await hrSource(request, destination, "messages", { method: "POST", body }),
    );
  } catch (error) {
    return hrFail(error);
  }
}
export { mutate as POST, mutate as PATCH };
