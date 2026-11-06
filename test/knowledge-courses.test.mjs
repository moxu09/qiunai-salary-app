import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { knowledgeCourseLocation, knowledgeCourseHref, knowledgeChapters } from "../lib/knowledgeCourses.mjs";
import { createKnowledgeCourseHandler, createKnowledgeCompletionHandler,createKnowledgeProgressHandler } from "../lib/knowledgeCourseHandler.mjs";
import { hrTabForPath } from "../lib/hrRoutes.mjs";

const id = "11111111-1111-4111-8111-111111111111";
const row = { id, organization_code: "qiunai", document_type: "knowledge", is_published: true,
  title: "課程", category: "客服", body: "完整內文", version: 2, updated_at: "2026-11-03T00:00:00Z", created_by: "private-actor" };
const request = (authorization = "Bearer test-session") => new Request("https://hr.example/api/hr/knowledge/qiunai/" + id, { headers: authorization ? { authorization } : {} });
const context = (department = "qiunai", courseId = id) => ({ params: Promise.resolve({ department, id: courseId }) });

test("course and lesson links stay in knowledge through login return routing", () => {
  for (const department of ["qiunai", "deepnight"]) for (const lesson of [null, 1, 123]) {
    const href = knowledgeCourseHref(department, id, lesson);
    assert.deepEqual(knowledgeCourseLocation(href), { department, id, lesson });
    assert.equal(hrTabForPath(href), "knowledge");
    assert.equal(hrTabForPath(href + "/"), "knowledge");
  }
  for (const path of ["//evil.example", "https://evil.example/collaboration/knowledge/qiunai/" + id,
    `/collaboration/knowledge/other/${id}`, `/collaboration/knowledge/qiunai/not-a-uuid`,
    `/collaboration/knowledge/qiunai/${id}/lessons/0`, `/collaboration/knowledge/qiunai/${id}/lessons/-1`,
    `/collaboration/knowledge/qiunai/${id}/lessons/1/extra`, `/collaboration/knowledge/qiunai/${id}?next=https://evil.example`]) {
    assert.equal(knowledgeCourseLocation(path), null); assert.equal(hrTabForPath(path), null);
  }
});

test("plain existing articles remain full text and headings produce ordered non-empty chapters", () => {
  assert.deepEqual(knowledgeChapters("原有文章\n第二行"), [{ number: 1, title: "全文閱讀", body: "原有文章\n第二行" }]);
  assert.deepEqual(knowledgeChapters("# 課程名稱\n\n## 第一章\n教學 A\n## 第二章\n教學 B"), [
    { number: 1, title: "第一章", body: "教學 A" }, { number: 2, title: "第二章", body: "教學 B" },
  ]);
  assert.deepEqual(knowledgeChapters("導讀文字\r\n## 操作步驟\r\n內容"), [
    { number: 1, title: "課程導讀", body: "導讀文字" }, { number: 2, title: "操作步驟", body: "內容" },
  ]);
  assert.deepEqual(knowledgeChapters("   "), []);
});

test("fenced code headings and HTML remain literal content", () => {
  for (const fence of ["```", "~~~"]) {
    const text = `## 課程\n${fence}text\n# 這不是章節\n${fence}\n<script>alert(1)</script>`;
    const chapters = knowledgeChapters(text);
    assert.equal(chapters.length, 1);assert.equal(chapters[0].title, "課程");
    assert.ok(chapters[0].body.includes("# 這不是章節"));
    assert.ok(chapters[0].body.includes("<script>alert(1)</script>"));
  }
});

test("a staff member cannot load another department, even with the same course UUID", async () => {
  const calls = [];
  const handler = createKnowledgeCourseHandler({ authorize: async () => ({ departments: [{ key: "qiunai" }] }), loadPublished: async (...args) => { calls.push(args);return row; } });
  assert.equal((await handler(request(), context("deepnight"))).status, 403);
  assert.deepEqual(calls, []);
  const response = await handler(request(), context());
  const result = await response.json();
  assert.equal(response.status, 200);assert.equal(result.document.body, "完整內文");
  assert.equal(result.document.organization, "qiunai");assert.equal(result.document.created_by, undefined);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("dual-store staff receive exactly the requested store, independent of UUID collisions", async () => {
  const handler = createKnowledgeCourseHandler({ authorize: async () => ({ departments: [{ key: "qiunai" }, { key: "deepnight" }] }),
    loadPublished: async (department) => ({ ...row, organization_code: department, title: department }) });
  for (const department of ["qiunai", "deepnight"]) {
    const result = await (await handler(request(), context(department))).json();
    assert.equal(result.document.organization, department);assert.equal(result.document.title, department);
  }
});

test("drafts, other document types, removed records, and mismatched source identity never return content", async () => {
  for (const item of [null, { ...row, is_published: false }, { ...row, document_type: "document" },
    { ...row, organization_code: "deepnight" }, { ...row, id: "22222222-2222-4222-8222-222222222222" }]) {
    const handler = createKnowledgeCourseHandler({ authorize: async () => ({ departments: [{ key: "qiunai" }] }), loadPublished: async () => item });
    const response = await handler(request(), context());assert.equal(response.status, 404);
    assert.equal((await response.json()).document, undefined);
  }
});

test("authentication and membership failures stop the lookup, and server errors do not disclose data", async () => {
  for (const status of [401, 403]) {
    const handler = createKnowledgeCourseHandler({ authorize: async () => { throw Object.assign(Error("private error"), { status }); }, loadPublished: async () => { throw Error("must not query"); } });
    assert.equal((await handler(request(), context())).status, status);
  }
  const handler = createKnowledgeCourseHandler({ authorize: async () => ({ departments: [{ key: "qiunai" }] }), loadPublished: async () => { throw Error("private database details"); } });
  const response = await handler(request(), context());assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("private"));
});

test("the actual HR API uses scoped course loading with authenticated identity and rejects expired sessions", async () => {
  const source = readFileSync(new URL("../app/api/hr/knowledge/[department]/[id]/route.js", import.meta.url), "utf8")
    .replace(/^import .*\n/gm, "").replaceAll("export ", "");
  const calls=[]; let expired=false;
  const globals={Response,Error,createKnowledgeCourseHandler,createKnowledgeCompletionHandler,createKnowledgeProgressHandler,
   authorizeCourseReader:async()=>{if(expired)throw Error("登入已失效，請重新登入");return {discordId:"123456789012345678",departments:[{key:"qiunai"}]};},
   loadKnowledgeCourse:async(department,documentId,actor)=>{calls.push([department,documentId,actor.discordId]);return row;},
   loadCourseCompletion:async(...args)=>{calls.push(args);return null;},loadCourseProgress:async()=>null,loadCourseReferences:async()=>[],learnCourse:async()=>{},completePrivateCourse:async()=>{throw Error('not called');}};
  runInNewContext(source+"\nthis.handler=GET;",globals);
  assert.equal((await globals.handler(request(""),context())).status,401);
  assert.equal((await globals.handler(request(),context())).status,200);
  assert.deepEqual(calls,[["qiunai",id,"123456789012345678"],["qiunai",id,"123456789012345678",2]]);
  expired=true;assert.equal((await globals.handler(request(),context())).status,401);
});

test('completion takes employee identity from authentication and rejects identity spoofing, stale versions and other stores',async()=>{
 const calls=[];
 const handler=createKnowledgeCompletionHandler({authorize:async()=>({discordId:'123456789012345678',departments:[{key:'qiunai'}]}),
  complete:async(...args)=>{calls.push(args);if(args[3]!==2)throw {code:'40001'};return {completion:{document_version:2,completed_at:'2026-11-03T00:00:00Z'}};}});
 const post=(body)=>new Request(request().url,{method:'POST',body:JSON.stringify(body)});
 assert.equal((await handler(post({version:2,discordId:'other'}),context())).status,400);assert.equal(calls.length,0);
 assert.equal((await handler(post({version:2}),context('deepnight'))).status,403);assert.equal(calls.length,0);
 assert.equal((await handler(post({version:2}),context())).status,200);assert.deepEqual(calls[0],['qiunai',id,'123456789012345678',2]);
 assert.equal((await handler(post({version:1}),context())).status,409);
});

test("screenshots appear in the chapter that references the attachment, with general files in chapter one", async () => {
  const {attachmentsForLesson}=await import("../lib/knowledgeCourses.mjs");
  const chapters=knowledgeChapters("# 接單\n見圖 dispatch.webp。\n# 結單\n請照 finish.png 操作。\n# 其他\n沒有附圖。");
  const files=["dispatch.webp","finish.png","補充資料.pdf"].map(name=>({name}));
  assert.deepEqual(attachmentsForLesson(files,chapters,1).map(f=>f.name),["dispatch.webp","補充資料.pdf"]);
  assert.deepEqual(attachmentsForLesson(files,chapters,2).map(f=>f.name),["finish.png"]);
  assert.deepEqual(attachmentsForLesson(files,chapters,3),[]);
  assert.deepEqual(attachmentsForLesson(files,chapters,999),[]);
});
