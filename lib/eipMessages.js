import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";

const MESSAGE_TABLE = "eip_direct_messages";
const DISCORD_ID = /^\d{15,22}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(message, status) {
  return NextResponse.json({ ok: false, message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function activeStaff(table, discordId) {
  const { data, error } = await supabaseAdmin.from(table)
    .select("discord_id,discord_name,display_name,avatar_url,is_active")
    .eq("discord_id", discordId).maybeSingle();
  if (error) throw error;
  return data?.is_active === false ? null : data;
}

function unexpected(error) {
  const code = String(error?.code || "");
  console.error("EIP messaging failed", code || "unknown");
  if (code === "42P01" || code === "PGRST202" || code === "PGRST205") {
    return failure("員工訊息資料表尚未啟用，請聯繫管理員。", 503);
  }
  return failure("訊息服務暫時無法使用，請稍後重試。", 500);
}

export function createEipMessageHandlers(organization, staffTable) {
  async function authenticate(request) {
    let discordId;
    try {
      ({ discordId } = await getAuthUserFromRequest(supabaseAdmin, request));
    } catch {
      throw Object.assign(new Error("請重新登入 EIP"), { status: 401 });
    }
    if (!DISCORD_ID.test(discordId)) throw Object.assign(new Error("登入資訊無效"), { status: 401 });
    const staff = await activeStaff(staffTable, discordId);
    if (!staff) throw Object.assign(new Error("只有在職員工可以使用訊息功能"), { status: 403 });
    return { discordId, staff };
  }

  async function get(request) {
    try {
      const { discordId } = await authenticate(request);
      const peerId = new URL(request.url).searchParams.get("peer");
      if (peerId !== null) {
        if (!DISCORD_ID.test(peerId) || peerId === discordId) return failure("對話對象不正確", 400);
        if (!await activeStaff(staffTable, peerId)) return failure("找不到在職員工", 404);
        const { data, error } = await supabaseAdmin.from(MESSAGE_TABLE)
          .select("id,sender_discord_id,recipient_discord_id,body,created_at,read_at")
          .eq("organization_code", organization)
          .in("sender_discord_id", [discordId, peerId])
          .in("recipient_discord_id", [discordId, peerId])
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(100);
        if (error) throw error;
        return NextResponse.json({ ok: true, messages: (data || []).reverse() }, {
          headers: { "Cache-Control": "no-store" },
        });
      }

      const [{ data: people, error: peopleError }, { data: conversations, error: conversationError }] = await Promise.all([
        supabaseAdmin.from(staffTable)
          .select("discord_id,discord_name,display_name,avatar_url,is_active")
          .or("is_active.eq.true,is_active.is.null")
          .order("display_name", { ascending: true, nullsFirst: false }).limit(1000),
        supabaseAdmin.rpc("eip_list_conversations", { p_org: organization, p_discord_id: discordId }),
      ]);
      if (peopleError) throw peopleError;
      if (conversationError) throw conversationError;
      const visible = (people || []).filter((person) => person.discord_id !== discordId && DISCORD_ID.test(person.discord_id));
      const byPeer = new Map((conversations || []).map((item) => [item.peer_discord_id, item]));
      const contacts = visible.map((person) => ({
        discordId: person.discord_id,
        name: person.display_name || person.discord_name || "員工",
        avatarUrl: person.avatar_url || null,
        lastMessage: byPeer.get(person.discord_id)?.last_body || null,
        lastAt: byPeer.get(person.discord_id)?.last_at || null,
        unreadCount: Number(byPeer.get(person.discord_id)?.unread_count || 0),
      })).sort((left, right) =>
        (right.lastAt || "").localeCompare(left.lastAt || "") || left.name.localeCompare(right.name, "zh-TW")
      );
      return NextResponse.json({ ok: true, contacts }, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      if (error?.status) return failure(error.message, error.status);
      if (String(error?.message || "").includes("登入")) return failure("請重新登入 EIP", 401);
      return unexpected(error);
    }
  }

  async function post(request) {
    try {
      const { discordId } = await authenticate(request);
      const raw = await request.text();
      if (raw.length > 10000) return failure("訊息內容過大", 413);
      let payload;
      try { payload = JSON.parse(raw); } catch { return failure("訊息格式不正確", 400); }
      const recipientId = String(payload?.recipientId || "").trim();
      const body = String(payload?.body || "").trim();
      const nonce = String(payload?.nonce || "").trim();
      if (!DISCORD_ID.test(recipientId) || recipientId === discordId) return failure("對話對象不正確", 400);
      if (!body || body.length > 2000) return failure("訊息須為 1 到 2000 個字", 400);
      if (!UUID.test(nonce)) return failure("訊息識別碼不正確", 400);
      if (!await activeStaff(staffTable, recipientId)) return failure("找不到在職員工", 404);
      const { data, error } = await supabaseAdmin.from(MESSAGE_TABLE)
        .insert({
          organization_code: organization,
          sender_discord_id: discordId,
          recipient_discord_id: recipientId,
          client_nonce: nonce,
          body,
        })
        .select("id,sender_discord_id,recipient_discord_id,body,created_at,read_at")
        .single();
      if (error?.code === "23505") {
        const { data: existing, error: existingError } = await supabaseAdmin.from(MESSAGE_TABLE)
          .select("id,sender_discord_id,recipient_discord_id,body,created_at,read_at")
          .eq("organization_code", organization).eq("sender_discord_id", discordId)
          .eq("client_nonce", nonce).maybeSingle();
        if (existingError) throw existingError;
        if (existing?.recipient_discord_id !== recipientId || existing?.body !== body) {
          return failure("訊息識別碼已使用", 409);
        }
        return NextResponse.json({ ok: true, message: existing, duplicate: true });
      }
      if (error) throw error;
      return NextResponse.json({ ok: true, message: data }, { status: 201 });
    } catch (error) {
      if (error?.status) return failure(error.message, error.status);
      if (String(error?.message || "").includes("登入")) return failure("請重新登入 EIP", 401);
      return unexpected(error);
    }
  }

  async function patch(request) {
    try {
      const { discordId } = await authenticate(request);
      const raw = await request.text();
      if (raw.length > 2000) return failure("要求內容過大", 413);
      let payload;
      try { payload = JSON.parse(raw); } catch { return failure("要求格式不正確", 400); }
      const peerId = String(payload?.peerId || "").trim();
      if (!DISCORD_ID.test(peerId) || peerId === discordId) return failure("對話對象不正確", 400);
      if (!await activeStaff(staffTable, peerId)) return failure("找不到在職員工", 404);
      const { error } = await supabaseAdmin.from(MESSAGE_TABLE)
        .update({ read_at: new Date().toISOString() })
        .eq("organization_code", organization)
        .eq("recipient_discord_id", discordId)
        .eq("sender_discord_id", peerId)
        .is("read_at", null);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error?.status) return failure(error.message, error.status);
      if (String(error?.message || "").includes("登入")) return failure("請重新登入 EIP", 401);
      return unexpected(error);
    }
  }

  return { GET: get, POST: post, PATCH: patch };
}
