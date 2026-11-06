const ROOT = "/collaboration/knowledge";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp(`^${ROOT}/(qiunai|deepnight)/(${UUID})(?:/lessons/([1-9][0-9]{0,5}))?/?$`, "i");

/** @typedef {"qiunai" | "deepnight"} Department */
/** @param {unknown} path @returns {{department: Department, id: string, lesson: number | null} | null} */
export function knowledgeCourseLocation(path) {
  const match = typeof path === "string" && path.match(PATH);
  if (!match || !["qiunai", "deepnight"].includes(match[1])) return null;
  return { department: /** @type {Department} */ (match[1]), id: match[2].toLowerCase(), lesson: match[3] ? Number(match[3]) : null };
}

/** @param {Department} department @param {string} id @param {number | null} [lesson] */
export function knowledgeCourseHref(department, id, lesson = null) {
  const path = `${ROOT}/${department}/${id}${lesson == null ? "" : `/lessons/${lesson}`}`;
  if (!knowledgeCourseLocation(path)) throw Error("課程網址不正確");
  return path;
}

// Published knowledge remains ordinary text. Headings outside code fences form
// chapters; React escapes the chapter bodies rather than executing stored HTML.
export function knowledgeChapters(body) {
  const chapters = [];
  let title = "全文閱讀", lines = [], fence = null;
  const append = () => {
    const text = lines.join("\n").trim();
    if (text) chapters.push({ number: chapters.length + 1, title, body: text });
  };
  for (const line of String(body || "").replace(/\r\n?/g, "\n").split("\n")) {
    const boundary = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (boundary) {
      if (!fence) fence = { character: boundary[1][0], length: boundary[1].length };
      else if (boundary[1][0] === fence.character && boundary[1].length >= fence.length && !boundary[2].trim()) fence = null;
      lines.push(line);
      continue;
    }
    const heading = !fence && line.match(/^ {0,3}#{1,3}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
    if (heading) {
      if (title === "全文閱讀") title = "課程導讀";
      append(); title = heading[1]; lines = [];
    }
    else lines.push(line);
  }
  append();
  return chapters;
}

export function knowledgeSummary(body, limit = 140) {
  return Array.from(String(body || "").replace(/(?:^|\n)\s*#{1,3}\s+/g, " ").replace(/\s+/g, " ").trim()).slice(0, limit).join("");
}

// Only attachment names already present in the authorized file list are used.
// Imported tutorials name their screenshots in the corresponding chapter.
export function attachmentsForLesson(files, chapters, lesson) {
  const current = chapters.find(chapter => chapter.number === lesson);
  if (!current) return [];
  return files.filter(file => current.body.includes(file.name) ||
    (lesson === 1 && !chapters.some(chapter => chapter.body.includes(file.name))));
}
