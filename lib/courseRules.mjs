import { knowledgeChapters } from './knowledgeCourses.mjs';

export class CourseError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const text = (value, name, max) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new CourseError(`${name}需填寫 1～${max} 字`);
  return value.trim();
};
export function validateCourse(input) {
  if (!input || typeof input !== 'object') throw new CourseError('課程資料不正確');
  const title = text(input.title, '課程名稱', 120), category = text(input.category || '教育訓練', '分類', 50);
  if (typeof input.isPublished !== 'boolean') throw new CourseError('請設定發布狀態');
  if (!Array.isArray(input.chapters) || !input.chapters.length || input.chapters.length > 100) throw new CourseError('課程需有 1～100 個章節');
  const chapters = input.chapters.map((chapter) => ({
    id: text(chapter?.id, '章節編號', 64), title: text(chapter?.title, '章節名稱', 120), body: text(chapter?.body, '章節內容', 20000),
  }));
  if (chapters.some((chapter) => !/^[a-zA-Z0-9_-]+$/.test(chapter.id)) || new Set(chapters.map((chapter) => chapter.id)).size !== chapters.length) throw new CourseError('章節編號不可重複');
  if (chapters.map((chapter) => `## ${chapter.title}\n\n${chapter.body}`).join('\n\n').length > 30000) throw new CourseError('課程內容合計最多 30,000 字');
  const audience = input.audience;
  if (!audience || !['all_staff', 'service', 'managers', 'selected'].includes(audience.kind)) throw new CourseError('請選擇課程對象');
  if(!Array.isArray(audience.ids || []))throw new CourseError('指定員工資料不正確');
  const ids = audience.kind === 'selected' ? [...new Set(audience.ids || [])] : [];
  if (ids.length > 500 || ids.some((id) => typeof id !== 'string' || !/^\d{15,22}$/.test(id)) || (audience.kind === 'selected' && !ids.length)) throw new CourseError('指定員工需填寫有效的 Discord ID，最多 500 人');
  const requirements = input.requirements;
  if (!requirements || typeof requirements.allChapters !== 'boolean' || typeof requirements.approval !== 'boolean' || !Number.isInteger(requirements.minimumSeconds) || requirements.minimumSeconds < 0 || requirements.minimumSeconds > 86400 || !Number.isInteger(requirements.passScore) || requirements.passScore < 1 || requirements.passScore > 100) throw new CourseError('結訓條件不正確，學習時間最多 1,440 分鐘，及格分數為 1～100');
  if (!Array.isArray(input.quiz) || input.quiz.length > 30) throw new CourseError('測驗最多 30 題');
  const quiz = input.quiz.map((question, i) => {
    if (!Array.isArray(question?.options) || question.options.length < 2 || question.options.length > 6 || !Number.isInteger(question.correct) || question.correct < 0 || question.correct >= question.options.length) throw new CourseError(`第 ${i + 1} 題需有 2～6 個選項及正確答案`);
    return { id: text(question.id, '題目編號', 64), question: text(question.question, '題目', 1000), options: question.options.map((option) => text(option, '選項', 500)), correct: question.correct };
  });
  if (new Set(quiz.map((q) => q.id)).size !== quiz.length || quiz.some((q) => !/^[a-zA-Z0-9_-]+$/.test(q.id))) throw new CourseError('題目編號不可重複');
  return { title, category, isPublished: input.isPublished, chapters, audience: { kind: audience.kind, ids }, requirements: { allChapters: requirements.allChapters, minimumSeconds: requirements.minimumSeconds, approval: requirements.approval, passScore: requirements.passScore }, quiz };
}
export function courseChapters(course) {
  if (Array.isArray(course?.chapters) && course.chapters.length) return course.chapters.map((chapter, i) => ({ ...chapter, number: i + 1 }));
  return knowledgeChapters(course?.body).map((chapter) => ({ ...chapter, id: `chapter-${chapter.number}` }));
}
export function learnerSettings(link) {
  return { managed: link.managed === true, chapters: link.chapters || [], requirements: link.requirements,
    quiz: (link.quiz || []).map(({ id, question, options }) => ({ id, question, options })) };
}
export function audienceMatches(audience, { active, manager, service, discordId }) {
  if (manager) return true;
  if (!active) return false;
  if (audience?.kind === 'all_staff') return true;
  if (audience?.kind === 'selected') return audience.ids?.includes(discordId) === true;
  if (audience?.kind === 'managers') return false;
  return service === true;
}
