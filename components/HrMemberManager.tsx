"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Department = { key: "qiunai" | "deepnight"; name: string };
type Member = { id: string; name: string; active: boolean };
type Props = {
  departments: Department[];
  request: (path: string, init?: RequestInit) => Promise<{ members?: Member[] }>;
};

export default function HrMemberManager({ departments, request }: Props) {
  const [department, setDepartment] = useState<Department["key"]>(departments[0].key);
  const [members, setMembers] = useState<Member[]>([]);
  const [discordId, setDiscordId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const read = useCallback(async () =>
    (await request(`/api/hr/members?department=${department}`)).members || [], [department, request]);

  useEffect(() => {
    let active = true;
    void read().then((rows) => { if (active) setMembers(rows); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [read]);

  async function changeMember(method: "POST" | "DELETE", id: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await request("/api/hr/members", { method, body: JSON.stringify({ department, discordId: id }) });
      if (method === "POST") setDiscordId("");
      setNotice(method === "POST" ? "已新增 Manager。" : "已移除 Manager 職等。");
      setMembers(await read());
    } catch (err) { setError(err instanceof Error ? err.message : "無法更新 HR 成員"); }
    finally { setBusy(false); }
  }

  function add(event: FormEvent) {
    event.preventDefault();
    void changeMember("POST", discordId.trim());
  }

  return (
    <div className="eip-collab-form">
      <p>PIC 由你的帳號擔任。你可以將本部門在職員工設為 Manager，移除後會回到 Staff。</p>
      <label>部門<select value={department} disabled={busy} onChange={(event) => {
        setMembers([]); setLoading(true); setError(""); setNotice("");
        setDepartment(event.target.value as Department["key"]);
      }}>{departments.map(({ key, name }) => <option key={key} value={key}>{name}</option>)}</select></label>
      <form className="eip-collab-form" onSubmit={add}>
        <label>員工 Discord ID<input value={discordId} onChange={(event) => setDiscordId(event.target.value)}
          required inputMode="numeric" pattern="[0-9]{15,22}" maxLength={22} /></label>
        <button type="submit" className="qiunai-button" disabled={busy || loading}>新增 Manager</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading ? <p>正在讀取成員…</p> : members.length ? members.map((member) => (
        <div className="eip-collab-row" key={member.id}>
          <span>{member.name} · {member.id}{member.active ? "" : "（停用）"}</span>
          <button type="button" className="qiunai-soft-button" disabled={busy} onClick={() => {
            if (window.confirm(`移除「${member.name}」的 Manager 職等？`)) void changeMember("DELETE", member.id);
          }}>移除 Manager</button>
        </div>
      )) : <p>此部門目前沒有 Manager。</p>}
    </div>
  );
}
