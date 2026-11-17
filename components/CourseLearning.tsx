"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type LearningProgress = {
  study_seconds: number;
  quiz_score: number | null;
};
type Completion = { document_version: number; completed_at: string };
type Props = {
  api: string;
  version: number;
  chapters: { id: string; title: string; number: number }[];
  lesson: number | null;
  requirements: { minimumSeconds: number; passScore: number };
  quiz: { id: string; question: string; options: string[] }[];
  initialProgress: LearningProgress | null;
  initialCompletion: Completion | null;
};

const empty: LearningProgress = { study_seconds: 0, quiz_score: null };

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export default function CourseLearning({
  api, version, chapters, lesson, requirements, quiz, initialProgress, initialCompletion,
}: Props) {
  const [progress, setProgress] = useState(initialProgress || empty);
  const [completion, setCompletion] = useState(initialCompletion);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const call = useCallback(async (action: "heartbeat" | "quiz", answers?: Record<string, number>) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("請重新登入");
    const response = await fetch(api, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ version, action, answers }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "學習進度儲存失敗");
    if (result.progress) {
      const next = result.progress as LearningProgress;
      setProgress((previous) => ({
        study_seconds: Math.max(previous.study_seconds, next.study_seconds),
        quiz_score: next.quiz_score === null
          ? previous.quiz_score
          : Math.max(previous.quiz_score ?? 0, next.quiz_score),
      }));
    }
    if (result.completion) setCompletion(result.completion);
    return result;
  }, [api, version]);

  useEffect(() => {
    if (completion) return;
    let active = true;
    let inflight = false;
    const pulse = async () => {
      if (!active || document.visibilityState !== "visible" || !document.hasFocus() || inflight) return;
      inflight = true;
      try {
        await call("heartbeat");
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : "學習時間暫時無法記錄");
      } finally {
        inflight = false;
      }
    };
    void pulse();
    const timer = window.setInterval(pulse, 15000);
    window.addEventListener("focus", pulse);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", pulse);
    };
  }, [call, completion]);

  async function submitQuiz() {
    if (submitting || completion) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const result = await call("quiz", answers);
      setNotice(`本次測驗 ${result.score} 分，歷次最高分會保留。`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "測驗提交失敗");
    } finally {
      setSubmitting(false);
    }
  }

  const showQuiz = quiz.length > 0 && (lesson === null || lesson === chapters.length);
  const studyGoal = requirements.minimumSeconds;
  const passScore = requirements.passScore;

  return (
    <section className="course-learning" aria-label="學習進度與結訓條件">
      <h3>學習進度</h3>
      {error && <p className="eip-collab-alert" role="alert">{error}</p>}
      {notice && <p className="eip-collab-notice" role="status">{notice}</p>}
      {studyGoal > 0 && (
        <p>
          學習時間 {formatDuration(progress.study_seconds)}／{formatDuration(studyGoal)}
          {progress.study_seconds >= studyGoal ? " · 已達標" : "。請保持課程頁面在前景，系統會自動記錄。"}
        </p>
      )}
      {quiz.length > 0 && (
        <p>
          及格分數 {passScore} 分
          {progress.quiz_score !== null ? ` · 目前最高 ${progress.quiz_score} 分` : " · 尚未提交測驗"}
          {progress.quiz_score !== null && progress.quiz_score >= passScore ? " · 已達標" : ""}
        </p>
      )}
      {showQuiz && (
        <form className="course-quiz" onSubmit={(event) => { event.preventDefault(); void submitQuiz(); }}>
          <h3>結訓測驗</h3>
          {quiz.map((question, index) => (
            <fieldset key={question.id} disabled={Boolean(completion)}>
              <legend>{index + 1}. {question.question}</legend>
              {question.options.map((option, i) => (
                <label className="course-check" key={i}>
                  <input
                    required type="radio" name={`quiz-${question.id}`} value={i}
                    checked={answers[question.id] === i}
                    onChange={() => setAnswers((previous) => ({ ...previous, [question.id]: i }))}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </fieldset>
          ))}
          <button type="submit" disabled={submitting || Boolean(completion)}>提交測驗</button>
        </form>
      )}
      <section className="hr-course-completion" aria-label="課程結訓">
        <h3>課程結訓</h3>
        <p role="status">
          {completion
            ? `已於 ${new Date(completion.completed_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })} 結訓。`
            : quiz.length > 0
              ? "測驗及格且學習時間達標後，系統會自動記錄結訓。"
              : "學習時間達標後，系統會自動記錄結訓。"}
        </p>
      </section>
    </section>
  );
}
