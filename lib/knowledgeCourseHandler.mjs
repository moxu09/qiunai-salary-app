import { knowledgeCourseLocation } from "./knowledgeCourses.mjs";

export function createKnowledgeCourseHandler({ authorize, loadPublished, loadCompletion = async () => null, loadProgress = async () => null }) {
  return async function GET(request, context) {
    const headers = { "Cache-Control": "no-store", Vary: "Authorization" };
    try {
      const { department, id } = await context.params;
      const location = knowledgeCourseLocation(`/collaboration/knowledge/${department}/${id}`);
      if (!location) return Response.json({ ok: false, message: "課程網址不正確" }, { status: 404, headers });
      const actor = await authorize(request);
      if (!actor.departments.some((item) => item.key === department))
        return Response.json({ ok: false, message: "沒有此店家的課程閱讀權限" }, { status: 403, headers });
      const item = await loadPublished(department, location.id, actor);
      if (!item || item.id.toLowerCase() !== location.id || item.organization_code !== department ||
          item.document_type !== "knowledge" || item.is_published !== true)
        return Response.json({ ok: false, message: "課程不存在或尚未發布" }, { status: 404, headers });
      const document = Object.fromEntries(["id", "title", "category", "body", "version", "updated_at", "is_course", "managed", "chapters", "requirements", "quiz"].map((key) => [key, item[key]]));
      const completion = await loadCompletion(department, location.id, actor.discordId, item.version);
      const progress = item.managed ? await loadProgress(department,location.id,actor.discordId,item.version) : null;
      return Response.json({ ok: true, document: { ...document, organization: department }, completion, progress }, { headers });
    } catch (error) {
      const status = [401, 403].includes(Number(error?.status)) ? Number(error.status) : 503;
      return Response.json({ ok: false, message: status === 401 ? "請重新登入 HR" : status === 403 ? "沒有課程閱讀權限" : "課程暫時無法讀取，請稍後重試" }, { status, headers });
    }
  };
}

export function createKnowledgeCompletionHandler({ authorize, complete }) {
  return async function POST(request, context) {
    const headers = { "Cache-Control": "no-store", Vary: "Authorization" };
    try {
      const { department, id } = await context.params;
      const location = knowledgeCourseLocation(`/collaboration/knowledge/${department}/${id}`);
      if (!location) return Response.json({ ok: false, message: "課程網址不正確" }, { status: 404, headers });
      const actor = await authorize(request);
      if (!actor.departments.some((item) => item.key === department))
        return Response.json({ ok: false, message: "沒有此店家的課程閱讀權限" }, { status: 403, headers });
      const text = await request.text();
      let input;
      try { if (text.length > 1000) throw Error(); input = JSON.parse(text); } catch { input = null; }
      if (!input || Object.keys(input).length !== 1 || !Number.isSafeInteger(input.version) || input.version < 1 || input.version > 2147483647)
        return Response.json({ ok: false, message: "結訓資料不正確" }, { status: 400, headers });
      const result = await complete(department, location.id, actor.discordId, input.version);
      return Response.json({ ok: true, ...result }, { headers });
    } catch (error) {
      const status = Number(error?.status) || ({ "42501": 403, P0002: 404, "40001": 409, "22023": 400 }[error?.code]) || 503;
      const message = status === 400 ? error.message : status === 401 ? "請重新登入 HR" : status === 403 ? "沒有結訓權限" : status === 404 ? "課程不存在或尚未發布" : status === 409 ? "課程已更新，請重新載入後閱讀並結訓" : "結訓紀錄暫時無法儲存，請稍後重試";
      return Response.json({ ok: false, message }, { status, headers });
    }
  };
}

export function createKnowledgeProgressHandler({authorize,learn}) {
 return async function PATCH(request,context){
  const headers={'Cache-Control':'no-store',Vary:'Authorization'};
  try{
   const {department,id}=await context.params;
   if(!knowledgeCourseLocation(`/collaboration/knowledge/${department}/${id}`))throw Object.assign(Error('課程網址不正確'),{status:404});
   const actor=await authorize(request);
   if(!actor.departments.some(store=>store.key===department))throw Object.assign(Error('沒有此店家的課程權限'),{status:403});
   const raw=await request.text();if(raw.length>10000)throw Object.assign(Error('學習資料過大'),{status:400});
   let input;try{input=JSON.parse(raw);}catch{throw Object.assign(Error('學習資料不正確'),{status:400});}
   if(!input||!Number.isSafeInteger(input.version)||input.version<1||!['heartbeat','read','quiz'].includes(input.action)||Object.keys(input).some(key=>!['version','action','chapter','answers'].includes(key)))throw Object.assign(Error('學習資料不正確'),{status:400});
   const result=await learn(department,id,actor.discordId,input.version,input.action,{chapter:input.chapter,answers:input.answers});
   return Response.json({ok:true,...result},{headers});
  }catch(error){const status=Number(error?.status)||({'42501':403,P0002:404,'40001':409,'22023':400}[error?.code])||503;return Response.json({ok:false,message:status>=500?'學習進度暫時無法儲存':error.message},{status,headers});}
 };
}
