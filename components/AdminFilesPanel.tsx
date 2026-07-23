"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  FileArchive,
  FileText,
  FolderKanban,
  GripVertical,
  Loader2,
  Trash2,
  Upload,
  UsersRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Category = "operations" | "employees";
type StoredFile = { path: string; name: string; size: number; contentType: string; createdAt: string };
const categories: Array<{ key: Category; label: string; icon: typeof FolderKanban }> = [
  { key: "operations", label: "營運相關", icon: FolderKanban },
  { key: "employees", label: "員工相關", icon: UsersRound },
];

export default function AdminFilesPanel({ apiPath }: { apiPath: string }) {
  const [category, setCategory] = useState<Category>("operations");
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [canUpload, setCanUpload] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [canReorder, setCanReorder] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sorting, setSorting] = useState(false);
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const draggedPathRef = useRef<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const getToken = useCallback(async () => { const { data } = await supabase.auth.getSession(); if (!data.session) throw new Error("請重新登入後台"); return data.session.access_token; }, []);
  const loadFiles = useCallback(async () => { try { const token = await getToken(); const response = await fetch(`${apiPath}?category=${category}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || "讀取檔案失敗"); setFiles(payload.files || []); setCanUpload(Boolean(payload.canUpload)); setCanDelete(Boolean(payload.canDelete)); setCanReorder(Boolean(payload.canReorder)); } catch (error) { console.error("load admin files failed", error); alert(error instanceof Error ? error.message : "讀取檔案失敗"); } finally { setLoading(false); } }, [apiPath, category, getToken]);
  useEffect(() => { const timeoutId = window.setTimeout(() => { void loadFiles(); }, 0); return () => window.clearTimeout(timeoutId); }, [loadFiles]);
  async function uploadFile() { if (!selectedFile) return alert("請先選擇檔案"); if (selectedFile.size > 25 * 1024 * 1024) return alert("單一檔案不得超過 25 MB"); setUploading(true); try { const token = await getToken(); const body = new FormData(); body.append("category", category); body.append("file", selectedFile); const response = await fetch(apiPath, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || "檔案上傳失敗"); setSelectedFile(null); setFileInputKey((value) => value + 1); await loadFiles(); alert("檔案上傳完成"); } catch (error) { console.error("upload admin file failed", error); alert(error instanceof Error ? error.message : "檔案上傳失敗"); } finally { setUploading(false); } }
  async function downloadFile(file: StoredFile) { setDownloading(file.path); try { const token = await getToken(); const params = new URLSearchParams({ download: file.path }); const response = await fetch(`${apiPath}?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }); const payload = await response.json().catch(() => ({})); if (!response.ok || !payload.url) throw new Error(payload.message || "建立下載連結失敗"); const fileResponse = await fetch(payload.url); if (!fileResponse.ok) throw new Error("下載檔案失敗"); const objectUrl = URL.createObjectURL(await fileResponse.blob()); const link = document.createElement("a"); link.href = objectUrl; link.download = payload.name || file.name; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); } catch (error) { console.error("download admin file failed", error); alert(error instanceof Error ? error.message : "檔案下載失敗"); } finally { setDownloading(null); } }
  async function deleteFile(file: StoredFile) { if (!window.confirm(`確定要永久刪除「${file.name}」嗎？\n刪除後無法復原。`)) return; setDeleting(file.path); try { const token = await getToken(); const response = await fetch(apiPath, { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ category, path: file.path }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || "刪除檔案失敗"); setFiles(payload.files || files.filter((item) => item.path !== file.path)); alert("檔案已刪除"); } catch (error) { console.error("delete admin file failed", error); alert(error instanceof Error ? error.message : "刪除檔案失敗"); } finally { setDeleting(null); } }
  async function reorderFile(sourcePath: string, targetPath: string) { const sourceIndex = files.findIndex((file) => file.path === sourcePath); const targetIndex = files.findIndex((file) => file.path === targetPath); if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex || sorting) return; const previous = files; const next = [...files]; const [movedFile] = next.splice(sourceIndex, 1); next.splice(targetIndex, 0, movedFile); setFiles(next); setSorting(true); try { const token = await getToken(); const response = await fetch(apiPath, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ category, orderedPaths: next.map((file) => file.path) }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || "調整檔案排序失敗"); setFiles(payload.files || next); } catch (error) { setFiles(previous); alert(error instanceof Error ? error.message : "調整檔案排序失敗"); } finally { setSorting(false); } }
  function beginDrag(path: string) { if (!canReorder || sorting) return; draggedPathRef.current = path; setDraggedPath(path); setDragOverPath(path); }
  function updateDragTarget(clientX: number, clientY: number) { if (!draggedPathRef.current) return; const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-file-path]"); const targetPath = target?.dataset.filePath || null; if (targetPath) setDragOverPath(targetPath); }
  function finishDrag(clientX: number, clientY: number) { const sourcePath = draggedPathRef.current; const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-file-path]"); const targetPath = target?.dataset.filePath || dragOverPath; draggedPathRef.current = null; setDraggedPath(null); setDragOverPath(null); if (sourcePath && targetPath && sourcePath !== targetPath) void reorderFile(sourcePath, targetPath); }
  return <main className="min-h-screen p-4 sm:p-7"><div className="mx-auto max-w-[1400px] space-y-5">
    <header className="rounded-3xl bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><span className="rounded-2xl bg-pink-100 p-3 text-pink-600"><FileArchive size={24}/></span><div><h1 className="text-2xl font-black text-[#3f2947]">資料下載</h1><p className="mt-1 text-sm text-[#80647d]">管理內部營運與員工相關文件。</p></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{categories.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => { setLoading(true); setCategory(key); }} className={`flex items-center gap-3 rounded-2xl border px-5 py-4 text-left font-black transition ${category === key ? "admin-files-solid-button border-pink-300 bg-pink-500 text-white shadow-md shadow-pink-100" : "border-pink-100 bg-pink-50 text-[#73516f] hover:border-pink-200"}`}><Icon size={20}/>{label}</button>)}</div></header>
    {canUpload ? <section className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-black text-[#3f2947]"><Upload size={19} className="text-pink-500"/>上傳到「{category === "operations" ? "營運相關" : "員工相關"}」</h2><div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"><input key={fileInputKey} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.rtf,.jpg,.jpeg,.png,.webp,.gif,.heic,.zip,.rar,.7z" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}/><button type="button" onClick={uploadFile} disabled={!selectedFile || uploading} className="admin-files-solid-button inline-flex items-center justify-center gap-2 rounded-2xl bg-pink-500 px-6 py-3 font-black text-white hover:bg-pink-600 disabled:opacity-40">{uploading ? <Loader2 size={18} className="animate-spin"/> : <Upload size={18}/>} {uploading ? "上傳中…" : "上傳檔案"}</button></div><p className="mt-3 text-xs text-[#80647d]">單一檔案上限 25 MB；僅指定帳號可以上傳。</p></section> : <p className="rounded-2xl border border-pink-100 bg-white px-5 py-4 text-sm font-semibold text-[#80647d]">此管理員帳號為查看與下載權限。</p>}
    <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
      <div className="border-b border-pink-100 px-6 py-5">
        <h2 className="text-lg font-black text-[#3f2947]">{category === "operations" ? "營運相關" : "員工相關"}檔案</h2>
        {canReorder ? <p className="mt-1 text-xs font-semibold text-pink-500">按住拖曳把手移動檔案，放開後會自動儲存順序。</p> : null}
      </div>
      {loading ? (
        <p className="flex items-center justify-center gap-2 p-12 text-sm text-[#a36b9e]"><Loader2 size={18} className="animate-spin"/>讀取中…</p>
      ) : files.length ? (
        <div className="divide-y divide-pink-50">
          {files.map((file) => (
            <article
              key={file.path}
              data-file-path={file.path}
              className={`flex flex-col gap-4 px-5 py-4 transition sm:flex-row sm:items-center sm:justify-between ${draggedPath === file.path ? "opacity-45" : ""} ${dragOverPath === file.path && draggedPath !== file.path ? "bg-pink-50 ring-2 ring-inset ring-pink-300" : ""}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                {canReorder ? (
                  <button
                    type="button"
                    aria-label={`拖曳調整 ${file.name} 的順序`}
                    title="按住並拖曳調整順序"
                    disabled={sorting}
                    onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); beginDrag(file.path); }}
                    onPointerMove={(event) => updateDragTarget(event.clientX, event.clientY)}
                    onPointerUp={(event) => finishDrag(event.clientX, event.clientY)}
                    onPointerCancel={() => { draggedPathRef.current = null; setDraggedPath(null); setDragOverPath(null); }}
                    className="touch-none cursor-grab rounded-xl border border-pink-100 p-2.5 text-pink-400 transition hover:border-pink-300 hover:bg-pink-50 hover:text-pink-600 active:cursor-grabbing disabled:cursor-wait disabled:opacity-40"
                  >
                    <GripVertical size={18}/>
                  </button>
                ) : null}
                <span className="shrink-0 rounded-xl bg-pink-50 p-2.5 text-pink-500"><FileText size={20}/></span>
                <div className="min-w-0"><p className="truncate font-bold text-[#3f2947]">{file.name}</p><p className="mt-1 text-xs text-[#a36b9e]">{formatBytes(file.size)} · {formatDate(file.createdAt)}</p></div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => downloadFile(file)} disabled={downloading === file.path} className="admin-files-solid-button inline-flex items-center justify-center gap-2 rounded-xl bg-[#3f2947] px-4 py-2 text-sm font-black text-white hover:bg-pink-500 disabled:opacity-50">{downloading === file.path ? <Loader2 size={16} className="animate-spin"/> : <Download size={16}/>}下載</button>
                {canDelete ? <button type="button" onClick={() => deleteFile(file)} disabled={deleting === file.path} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-black text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-50">{deleting === file.path ? <Loader2 size={16} className="animate-spin"/> : <Trash2 size={16}/>}刪除</button> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="p-12 text-center text-sm text-[#a36b9e]">這個分類目前沒有檔案</p>
      )}
    </section>
  </div></main>;
}
function formatBytes(value: number) { if (!value) return "0 KB"; if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`; return `${(value / 1024 / 1024).toFixed(1)} MB`; }
function formatDate(value: string) { if (!value) return "-"; return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
