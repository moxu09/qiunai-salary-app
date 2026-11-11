"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

type RequestPdf = (url: string, options?: RequestInit) => Promise<Response>;
type Pdf = { document: PDFDocumentProxy; aspect: number };

function DocumentPage({ pdf, aspect, number, onLastPage, onError }: {
  pdf: PDFDocumentProxy;
  aspect: number;
  number: number;
  onLastPage: () => void;
  onError: () => void;
}) {
  const element = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nearby, setNearby] = useState(false);
  const [text, setText] = useState("");
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setNearby(entry.isIntersecting), { rootMargin: "350px 0px" });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearby || !canvasRef.current || !element.current) return;
    const canvas = canvasRef.current;
    const container = element.current;
    let task: RenderTask | undefined;
    let active = true;
    void pdf.getPage(number).then(async (page) => {
      if (!active) return;
      const width = Math.min(1200, container.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      task = page.render({ canvas, viewport });
      await task.promise;
      if (!active) return;
      setRendered(true);
      const contents = await page.getTextContent().catch(() => null);
      if (active && contents) setText(contents.items.map((item) => "str" in item ? item.str : "").join(" "));
    }).catch(() => { if (active) onError(); });
    return () => {
      active = false;
      task?.cancel();
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [nearby, number, onError, pdf]);

  const last = number === pdf.numPages;
  const end = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!last || !rendered || !end.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        onLastPage();
        observer.disconnect();
      }
    });
    observer.observe(end.current);
    return () => observer.disconnect();
  }, [last, onLastPage, rendered]);

  return <figure ref={element} className="relative m-0 overflow-hidden border border-slate-200 bg-white"
    style={{ aspectRatio: aspect }} aria-label={`第 ${number} 頁，共 ${pdf.numPages} 頁`}>
    <canvas ref={canvasRef} className="block w-full" aria-hidden="true" />
    {text ? <p className="sr-only">{text}</p> : null}
    {last ? <span ref={end} aria-hidden="true" className="absolute bottom-0 left-0 h-px w-px" /> : null}
  </figure>;
}

export default function HrSigningPdfReader({ url, title, request, onLastPage, children }: {
  url: string;
  title: string;
  request: RequestPdf;
  onLastPage: () => void;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<Pdf | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const showRenderError = useCallback(() => setError("文件頁面載入失敗，請重新載入。"), []);

  useEffect(() => {
    const abort = new AbortController();
    let task: PDFDocumentLoadingTask | undefined;
    void Promise.all([request(url, { signal: abort.signal }), import("pdfjs-dist/legacy/build/pdf.mjs")])
      .then(async ([response, library]) => {
        const data = await response.arrayBuffer();
        if (abort.signal.aborted) return;
        library.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).href;
        task = library.getDocument({ data, useWasm: false });
        const document = await task.promise;
        const viewport = (await document.getPage(1)).getViewport({ scale: 1 });
        if (!abort.signal.aborted) setState({ document, aspect: viewport.width / viewport.height });
      })
      .catch(() => { if (!abort.signal.aborted) setError("暫時無法顯示合約，請重新載入。"); });
    return () => {
      abort.abort();
      void task?.destroy().catch(() => {});
    };
  }, [attempt, request, url]);

  function retry() {
    setState(null);
    setError("");
    setAttempt(attempt + 1);
  }

  return <section id="hr-signing-reader" tabIndex={-1} className="scroll-mt-5 space-y-3" aria-label={title}>
    {error ? <div className="rounded-lg bg-rose-50 p-4">
      <p role="alert" className="mb-2 text-rose-900">{error}</p>
      <button type="button" className="font-bold underline" onClick={retry}>重新載入文件</button>
    </div> : state ? <>
      <p className="text-sm text-slate-600">請閱讀完整文件並滑到最下方。</p>
      <div className="space-y-2 rounded-xl bg-slate-100 p-1 sm:p-2">
        {Array.from({ length: state.document.numPages }, (_, index) => <DocumentPage
          key={index} pdf={state.document} aspect={state.aspect} number={index + 1}
          onLastPage={onLastPage} onError={showRenderError} />)}
      </div>
      {children}
    </> : <p role="status">正在載入文件…</p>}
  </section>;

}
