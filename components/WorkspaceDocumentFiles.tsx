"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileUp, Paperclip } from "lucide-react";
import { supabase } from "@/lib/supabase";

type WorkspaceFile = { path: string; name: string; size: number; createdAt: string };
type Props = {
  organization: "qiunai" | "deepnight";
  documentId: string;
  admin?: boolean;
};

const fileSize = (bytes: number) => bytes >= 1024 * 1024
  ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
  : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;

export default function WorkspaceDocumentFiles({ organization, documentId, admin = false }: Props) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const call = useCallback(async (method: "GET" | "POST", suffix = "", body?: FormData) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("登入已過期，請重新登入");
    const query = `documentId=${encodeURIComponent(documentId)}${admin ? "&admin=1" : ""}${suffix}`;
    const response = await fetch(`/api/${organization}/workspace/files?${query}`, {
      method,
      cache: "no-store",
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      ...(body ? { body } : {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "附件操作失敗");
    return result;
  }, [admin, documentId, organization]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await call("GET");
      setFiles(Array.isArray(result.files) ? result.files : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "讀取附件失敗");
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  async function upload() {
    if (!selectedFile || busy) return;
    if (selectedFile.size > 25 * 1024 * 1024) { setError("單一檔案不得超過 25 MB"); return; }
    const body = new FormData();
    body.set("documentId", documentId);
    body.set("file", selectedFile);
    try {
      setBusy(true); setError(""); setNotice("");
      await call("POST", "", body);
      setSelectedFile(null);
      setNotice("附件已上傳。未發布的文章不會顯示給員工。");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上傳附件失敗");
    } finally {
      setBusy(false);
    }
  }

  async function download(file: WorkspaceFile) {
    try {
      setError("");
      const result = await call("GET", `&download=${encodeURIComponent(file.path)}`);
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "下載附件失敗");
    }
  }

  return <section className="eip-workspace-files" aria-label="文件附件">
    <div className="eip-collab-panel-head"><h3><Paperclip size={17} /> 附件</h3><span>{files.length} / 20 個</span></div>
    {error ? <p className="eip-collab-alert" role="alert">{error}</p> : null}
    {notice ? <p className="eip-collab-notice" role="status">{notice}</p> : null}
    {loading ? <p className="eip-collab-empty">正在讀取附件…</p> : files.length ? <div className="eip-workspace-file-list">
      {files.map((file) => <button type="button" key={file.path} onClick={() => void download(file)}><span><strong>{file.name}</strong><small>{fileSize(file.size)}</small></span><Download size={17} /></button>)}
    </div> : <p className="eip-collab-empty">尚未上傳附件。</p>}
    {admin ? <div className="eip-workspace-upload">
      <label>選擇檔案<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.rtf,.jpg,.jpeg,.png,.webp,.gif,.heic,.zip,.rar,.7z" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} /></label>
      <button type="button" disabled={!selectedFile || busy || files.length >= 20} onClick={() => void upload()}><FileUp size={16} /> {busy ? "上傳中…" : "上傳附件"}</button>
      <p>支援文件、圖片及壓縮檔；單檔最多 25 MB，每篇最多 20 個。已上傳附件會保留，不因文章編輯而覆蓋。</p>
    </div> : null}
  </section>;
}
