"use client";
/* eslint-disable @next/next/no-img-element -- private signed attachment URLs must not be sent to the public image optimizer */

import { useCallback, useEffect, useState } from "react";
import { Download, FileUp, Paperclip } from "lucide-react";
import { supabase } from "@/lib/supabase";

type WorkspaceFile = { path: string; name: string; size: number; createdAt: string; previewUrl?: string | null };
type Props = {
  organization: "qiunai" | "deepnight";
  documentId: string;
  admin?: boolean;
  apiPath?: string;
  allowRemove?:boolean;
  inlineImages?:boolean;
  filterFiles?:(files:WorkspaceFile[])=>WorkspaceFile[];
  onChanged?:(version?:number)=>void;
};

const fileSize = (bytes: number) => bytes >= 1024 * 1024
  ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
  : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;

export default function WorkspaceDocumentFiles({ organization, documentId, admin = false, apiPath,allowRemove=false,onChanged,inlineImages=false,filterFiles }: Props) {
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [archivedFiles,setArchivedFiles]=useState<WorkspaceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const call = useCallback(async (method: "GET" | "POST", suffix = "", body?: FormData) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("登入已過期，請重新登入");
    const query = `documentId=${encodeURIComponent(documentId)}${admin ? "&admin=1" : ""}${suffix}`;
    const response = await fetch(`${apiPath || `/api/${organization}/workspace/files`}?${query}`, {
      method,
      cache: "no-store",
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      ...(body ? { body } : {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "附件操作失敗");
    return result;
  }, [admin, documentId, organization, apiPath]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await call("GET", inlineImages ? "&previews=1" : "");
      setUnavailable([]);
      setFiles(Array.isArray(result.files) ? result.files : []);
      setArchivedFiles(result.archivedFiles||[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "讀取附件失敗");
    } finally {
      setLoading(false);
    }
  }, [call, inlineImages]);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  async function upload() {
    if (!selectedFile || busy) return;
    if (selectedFile.size > 25 * 1024 * 1024) { setError("單一檔案不得超過 25 MB"); return; }
    const body = new FormData();
    body.set("documentId", documentId);
    body.set("file", selectedFile);
    try {
      setBusy(true); setError(""); setNotice("");
      const result=await call("POST", "", body);
      setSelectedFile(null);
      setNotice("附件已上傳。未發布的文章不會顯示給員工。");
      await refresh();
      onChanged?.(result.version);
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
  async function toggle(file:WorkspaceFile,restore=false){
    setBusy(true);setError('');
    try{
      const {data}=await supabase.auth.getSession();if(!data.session)throw Error('請重新登入');
      const response=await fetch(apiPath!,{method:restore?'PATCH':'DELETE',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({path:file.path})});
      const result=await response.json();if(!response.ok)throw Error(result.message||'附件操作失敗');
      await refresh();onChanged?.(result.version);setNotice(restore?'已恢復附件。':'已移除附件，可從下方恢復。');
    }catch(error){setError(error instanceof Error?error.message:'附件操作失敗');}finally{setBusy(false);}
  }

  const shown = filterFiles ? filterFiles(files) : files;
  if (inlineImages && !loading && !error && !shown.length) return null;
  return <section className="eip-workspace-files" aria-label="文件附件">
    <div className="eip-collab-panel-head"><h3><Paperclip size={17} /> 附件</h3><span>{shown.length}{admin ? " / 20" : ""} 個</span></div>
    {error ? <p className="eip-collab-alert" role="alert">{error}</p> : null}
    {notice ? <p className="eip-collab-notice" role="status">{notice}</p> : null}
    {loading ? <p className="eip-collab-empty">正在讀取附件…</p> : shown.length ? <div className="eip-workspace-file-list">
      {shown.map((file) => admin&&allowRemove?<div key={file.path} className="course-attachment-row"><button type="button" onClick={()=>void download(file)}><span><strong>{file.name}</strong><small>{fileSize(file.size)}</small></span><Download size={17}/></button><button type="button" disabled={busy} onClick={()=>void toggle(file)}>移除附件</button></div> : <div key={file.path} className={inlineImages ? "course-inline-attachment" : undefined}>
        {inlineImages && file.previewUrl && !unavailable.includes(file.path) ? <figure><img src={file.previewUrl} alt={file.name} loading="lazy" referrerPolicy="no-referrer" onError={()=>setUnavailable(old=>old.includes(file.path)?old:[...old,file.path])}/></figure> : null}
        <button type="button" onClick={()=>void download(file)}><span><strong>{file.name}</strong><small>{fileSize(file.size)}</small></span><Download size={17}/></button>
      </div>)}
    </div> : <p className="eip-collab-empty">尚未上傳附件。</p>}
    {inlineImages && shown.some(file=>unavailable.includes(file.path)) ? <button type="button" onClick={()=>void refresh()}>重新載入圖片</button> : null}
    {admin&&allowRemove&&archivedFiles.length?<details><summary>已移除附件 · {archivedFiles.length} 個</summary>{archivedFiles.map(file=><div key={file.path}><span>{file.name}</span><button type="button" disabled={busy} onClick={()=>void toggle(file,true)}>恢復附件</button></div>)}</details>:null}
    {admin ? <div className="eip-workspace-upload">
      <label>選擇檔案<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.rtf,.jpg,.jpeg,.png,.webp,.gif,.heic,.zip,.rar,.7z" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} /></label>
      <button type="button" disabled={!selectedFile || busy || files.length >= 20} onClick={() => void upload()}><FileUp size={16} /> {busy ? "上傳中…" : "上傳附件"}</button>
      <p>支援文件、圖片及壓縮檔；單檔最多 25 MB，每篇最多 20 個。已上傳附件會保留，不因文章編輯而覆蓋。</p>
    </div> : null}
  </section>;
}
