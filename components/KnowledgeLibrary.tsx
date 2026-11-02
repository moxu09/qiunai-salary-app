"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenText, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { knowledgeCourseHref, knowledgeCourseLocation, knowledgeSummary } from "@/lib/knowledgeCourses.mjs";
import WorkspaceDocumentFiles from "@/components/WorkspaceDocumentFiles";
import CourseLearning,{type LearningProgress} from '@/components/CourseLearning';
import {courseChapters} from '@/lib/courseRules.mjs';

type Department = "qiunai" | "deepnight";
type Document = { is_course?: boolean; managed?:boolean; chapters?:{id:string;title:string;body:string}[];requirements?:React.ComponentProps<typeof CourseLearning>['requirements'];quiz?:React.ComponentProps<typeof CourseLearning>['quiz']; id: string; organization?: Department; title: string; category: string; body: string; version: number; updated_at: string };
type Props = { documents: Document[]; organization: Department | "hr"; loading: boolean; basePath?: string; apiBase?: string; libraryHref?: string };
type Completion = { document_version: number; completed_at: string };
type Reader = { key: string; loading: boolean; document: Document | null; completion: Completion | null; progress?:LearningProgress|null; error: string };
const departmentName = (department: Department) => department === "qiunai" ? "秋奈電競" : "深夜不關燈";
function dateLabel(value: string, withTime = false) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "尚無更新時間" : new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "medium", ...(withTime ? { timeStyle: "short" } as const : {}) }).format(date);
}

export default function KnowledgeLibrary({ documents, organization, loading, basePath = "/collaboration/knowledge", apiBase = "/api/hr/knowledge", libraryHref }: Props) {
  const pathname = usePathname();
  const location = knowledgeCourseLocation(pathname.replace(basePath, "/collaboration/knowledge"));
  const href = (store: Department, courseId: string, lesson: number | null = null) => knowledgeCourseHref(store, courseId, lesson).replace("/collaboration/knowledge", basePath);
  const department = location?.department as Department | undefined;
  const id = location?.id as string | undefined;
  const readerKey = department && id ? `${department}:${id}` : "";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [retry, setRetry] = useState(0);
  const [reader, setReader] = useState<Reader | null>(null);
  const [completing, setCompleting] = useState("");
  const [completionError, setCompletionError] = useState({ key: "", message: "" });

  useEffect(() => {
    if (!department || !id) return;
    const controller = new AbortController();
    const key = `${department}:${id}`;
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setReader({ key, loading: true, document: null, completion: null, error: "" });
      try {
        const { data } = await supabase.auth.getSession();
        if (controller.signal.aborted) return;
        if (!data.session) throw Error("登入已過期，請重新登入 HR");
        const response = await fetch(`${apiBase}/${department}/${id}`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: "no-store", signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok || !result.document) throw Error(result.message || "課程暫時無法讀取");
        if (!controller.signal.aborted) setReader({ key, loading: false, document: result.document, completion: result.completion || null, progress:result.progress||null, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) setReader({ key, loading: false, document: null, completion: null, error: error instanceof Error ? error.message : "課程暫時無法讀取" });
      }
    });
    return () => controller.abort();
  }, [department, id, retry, apiBase]);

  async function completeCourse(course: Document) {
    if (!department || !id || completing === readerKey) return;
    const key = readerKey;
    setCompleting(key);setCompletionError({ key, message: "" });
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw Error("登入已過期，請重新登入 HR");
      const response = await fetch(`${apiBase}/${department}/${id}`, {
        method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ version: course.version }),
      });
      const result = await response.json();
      if (!response.ok || !result.completion) throw Error(result.message || "結訓紀錄暫時無法儲存");
      setReader((previous) => previous?.key === key && previous.document?.version === course.version ? { ...previous, completion: result.completion } : previous);
    } catch (error) {
      setCompletionError({ key, message: error instanceof Error ? error.message : "結訓紀錄暫時無法儲存" });
    } finally { setCompleting((previous) => previous === key ? "" : previous); }
  }

  const courses = useMemo(() => documents.flatMap((document) => {
    const store = document.organization || (organization === "hr" ? null : organization);
    if (!store) return [];
    return [{ ...document, organization: store }];
  }), [documents, organization]);
  const availableDepartments = Array.from(new Set(courses.map((course) => course.organization)));
  const found = courses.filter((course) => (filter === "all" || course.organization === filter) &&
    [course.title, course.category, course.body].some((value) => String(value || "").toLocaleLowerCase("zh-TW").includes(query.trim().toLocaleLowerCase("zh-TW"))));

  if (!location) return <div className="eip-collab-panel hr-knowledge-library">
    <div className="eip-collab-panel-head"><h2>知識與課程</h2><span>{found.length} 篇</span></div>
    <p className="hr-course-note">點選課程閱讀全文，也可以從章節目錄選擇需要的內容。</p>
    <div className="hr-course-tools">
      <label className="eip-collab-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋課程、分類或內文" aria-label="搜尋課程" /></label>
      {availableDepartments.length > 1 ? <label>店家<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">所有店家</option>{availableDepartments.map((store) => <option key={store} value={store}>{departmentName(store)}</option>)}</select></label> : null}
    </div>
    {loading ? <p className="eip-collab-empty" role="status">正在讀取知識與課程…</p> : <div className="hr-course-grid">
      {found.map((course) => <Link className="hr-course-card" key={`${course.organization}:${course.id}`} href={href(course.organization, course.id)}>
        <div className="hr-course-card-meta"><BookOpenText size={22} /><span>{departmentName(course.organization)}</span></div>
        <span className="hr-course-category">{course.category || "一般知識"}</span>
        <h3>{course.title}</h3>
        <p>{knowledgeSummary(course.body) || "開啟課程以查看內容與附件。"}</p>
        <div className="hr-course-card-footer"><small>版本 {course.version} · {dateLabel(course.updated_at)}</small><strong>開始閱讀 <ArrowRight size={16} /></strong></div>
      </Link>)}
      {!found.length ? <p className="eip-collab-empty">{courses.length ? "沒有符合搜尋條件的課程。" : "目前尚未發布知識與課程。"}</p> : null}
    </div>}
  </div>;

  // Never display the previous course while a different store/id is loading.
  const current = reader?.key === readerKey ? reader : null;
  const course = current?.document;
  const chapters: {id:string;number:number;title:string;body:string}[] = courseChapters(course);
  const lesson = location.lesson as number | null;
  const missingLesson = lesson != null && lesson > chapters.length;
  const courseUrl = href(location.department, location.id);
  return <section className="hr-course-reader" aria-label="課程閱讀">
    <div className="hr-course-reader-tools"><Link href={libraryHref || basePath}><ArrowLeft size={17} /> 返回知識庫</Link><button type="button" onClick={() => setRetry((value) => value + 1)} disabled={current?.loading}>重新載入課程</button></div>
    {!current || current.loading ? <div className="eip-collab-panel" role="status">正在讀取課程…</div> : current.error ? <div className="eip-collab-panel"><p className="eip-collab-alert" role="alert">{current.error}</p></div> : course ? <>
      <header className="eip-collab-panel hr-course-heading"><span>{departmentName(location.department)} · {course.category || "一般知識"}</span><h2>{course.title}</h2><p>版本 {course.version} · 更新於 {dateLabel(course.updated_at)} · {chapters.length} 個章節</p></header>
      <div className="hr-course-layout">
        <details className="eip-collab-panel hr-course-toc" open><summary><BookOpenText size={18} /> 章節目錄</summary><nav aria-label="課程章節">
          <Link href={courseUrl} aria-current={lesson == null ? "page" : undefined}>完整課程</Link>
          {chapters.map((chapter) => <Link key={chapter.number} href={href(location.department, location.id, chapter.number)} aria-current={lesson === chapter.number ? "page" : undefined}><span>{chapter.number}</span>{chapter.title}</Link>)}
        </nav></details>
        <article className="eip-collab-panel hr-course-content">
          {missingLesson ? <><h3>找不到此章節</h3><p>課程可能已更新，請從目錄重新選擇章節。</p><Link href={courseUrl}>閱讀完整課程</Link></> : <>
            {(lesson == null ? chapters : chapters.filter((chapter) => chapter.number === lesson)).map((chapter) => <section className="hr-course-chapter" key={chapter.number}><span>第 {chapter.number} 章</span><h3>{chapter.title}</h3><div className="hr-course-text">{chapter.body || "本章節尚無內文。"}</div></section>)}
            {!chapters.length ? <p className="hr-course-note">課程內容請參閱下方附件。</p> : null}
            <nav className="hr-course-pagination" aria-label="章節切換">
              {lesson != null && lesson > 1 ? <Link href={href(location.department, location.id, lesson - 1)}><ChevronLeft size={17} /> 上一章</Link> : <span />}
              {lesson == null && chapters.length ? <Link href={href(location.department, location.id, 1)}>逐章閱讀 <ChevronRight size={17} /></Link> : lesson != null && lesson < chapters.length ? <Link href={href(location.department, location.id, lesson + 1)}>下一章 <ChevronRight size={17} /></Link> : null}
            </nav>
          </>}
          <section className="hr-course-files" aria-label="課程附件"><h3>課程附件</h3><WorkspaceDocumentFiles key={`${location.department}:${course.id}:${course.version}`} organization={location.department} documentId={course.id} apiPath={course.is_course ? `${apiBase}/${location.department}/${course.id}/files` : undefined} /></section>
          {course.managed&&course.requirements&&!missingLesson?<CourseLearning key={`${location.department}:${course.id}:${course.version}`} api={`${apiBase}/${location.department}/${course.id}`} version={course.version} chapters={chapters} lesson={lesson} requirements={course.requirements} quiz={course.quiz||[]} initialProgress={current.progress||null} initialCompletion={current.completion}/>:null}
          {course.is_course && !course.managed && !missingLesson && (lesson == null || lesson === chapters.length) ? <section className="hr-course-completion" aria-label="課程結訓">
            <h3>課程結訓</h3>
            {current.completion?.document_version === course.version ? <p role="status">已於 {dateLabel(current.completion.completed_at, true)} 結訓。</p> : <p>完成閱讀後，按下結訓以保存你的課程完成紀錄。</p>}
            {completionError.key === readerKey && completionError.message ? <p className="eip-collab-alert" role="alert">{completionError.message}</p> : null}
            <button type="button" className="qiunai-button" disabled={completing === readerKey || current.completion?.document_version === course.version} onClick={() => void completeCourse(course)}>{current.completion?.document_version === course.version ? "已結訓" : completing === readerKey ? "結訓中…" : "結訓"}</button>
          </section> : null}
        </article>
      </div>
    </> : null}
  </section>;
}
