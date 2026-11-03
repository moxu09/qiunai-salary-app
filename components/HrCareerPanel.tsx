"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { recentRankingMonths } from "@/lib/hrRankMonths.mjs";
type Ranking = {
  month?: string;
  rank: number;
  participantCount: number;
  performanceAmount: number;
  customerServicePoints: number;
};
type Career = {
  key: string;
  currentRate: number;
  currentLabel: string;
  monthlyCreditedSalary: number;
  thisYearSalary: number;
  ranking?: Ranking | null;
};
const money = (value: number) => `$${Number(value || 0).toLocaleString("zh-TW")}`;
export default function HrCareerPanel() {
  const [data, setData] = useState<Career[]>([]);
  const [error, setError] = useState("");
  const [rankingMonths] = useState(() => recentRankingMonths());
  const [selectedRankingMonth, setSelectedRankingMonth] = useState(rankingMonths[0]);
  const [historicalRankings, setHistoricalRankings] = useState<Record<string, Ranking | null> | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: auth } = await supabase.auth.getSession();
        const response = await fetch("/api/hr/career", {
          headers: { Authorization: `Bearer ${auth.session?.access_token || ""}` },
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw Error(payload.message || "讀取薪資資格失敗");
        if (!cancelled) setData(payload.departments);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "讀取失敗");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (selectedRankingMonth === rankingMonths[0]) return;

    const controller = new AbortController();
    async function loadHistoricalRanking() {
      try {
        const { data: auth } = await supabase.auth.getSession();
        const response = await fetch(`/api/hr/performance-rank?month=${selectedRankingMonth}`, {
          headers: { Authorization: `Bearer ${auth.session?.access_token || ""}` },
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw Error(payload.message || "讀取歷史排名失敗");
        if (!controller.signal.aborted) {
          setHistoricalRankings(Object.fromEntries(
            (payload.departments || []).map((department: { key: string; ranking: Ranking }) => [department.key, department.ranking]),
          ));
        }
      } catch (caught) {
        if (!controller.signal.aborted)
          setRankingError(caught instanceof Error ? caught.message : "讀取歷史排名失敗");
      } finally {
        if (!controller.signal.aborted) setRankingLoading(false);
      }
    }
    void loadHistoricalRanking();
    return () => controller.abort();
  }, [selectedRankingMonth, rankingMonths]);
  return (
    <section className="hr-card">
      <h2>我的抽成與業績</h2>
      <p className="hr-note">抽成資格與進度顯示目前狀態；排名可切換月份，兩家店分別計算。</p>
      <label className="hr-ranking-month-control">
        <span>查看業績排名月份</span>
        <select
          value={selectedRankingMonth}
          onChange={(event) => {
            const month = event.target.value;
            setSelectedRankingMonth(month);
            setHistoricalRankings(null);
            setRankingError("");
            setRankingLoading(month !== rankingMonths[0]);
          }}
        >
          {rankingMonths.map((month, index) => (
            <option key={month} value={month}>
              {month.replace("-", " 年 ")} 月{index === 0 ? "（本月）" : ""}
            </option>
          ))}
        </select>
      </label>
      {selectedRankingMonth !== rankingMonths[0] ? (
        <p className="hr-note">歷史名次依目前訂單與員工名單重新計算；補登訂單或人員異動可能改變名次。</p>
      ) : null}
      {rankingError ? <p role="alert" className="hr-error">{rankingError}</p> : null}
      {error ? (
        <p role="alert" className="hr-error">
          {error}
        </p>
      ) : !data.length ? (
        <p className="hr-note">讀取業績中…</p>
      ) : (
        data.map((commissionInfo) => {
          const ranking = selectedRankingMonth === rankingMonths[0]
            ? commissionInfo.ranking
            : historicalRankings?.[commissionInfo.key];
          const isQiunai = commissionInfo.key === "qiunai";
          const commissionProgress = (
            <>
              <Progress
                title={
                  isQiunai
                    ? "本月一般訂單＋打賞｜85% 進度"
                    : "累計訂單｜85% 進度"
                }
                current={commissionInfo.monthlyCreditedSalary}
                target={10000}
              />
              <Progress
                title="今年薪資｜90% 進度"
                current={commissionInfo.thisYearSalary}
                target={100000}
              />
            </>
          );
          return (
          <div className="hr-career-department" key={commissionInfo.key}>
            <h3>
              {commissionInfo.key === "qiunai" ? "秋奈電競" : "深夜不關燈"} ·{" "}
              {commissionInfo.currentRate}%
            </h3>
            <p className="hr-note">{commissionInfo.currentLabel}</p>
            {isQiunai ? (
              <details className="hr-commission-details">
                <summary>抽成檔位與升級進度</summary>
                {commissionProgress}
                <p className="hr-note">
                  85% 依當月一般訂單＋打賞金額判定，滿 10,000 元後隔月生效一個月；90%
                  依今年薪資進度，達標後隔年生效一年。2027年將會有新制度改革。
                </p>
              </details>
            ) : commissionProgress}
            {rankingLoading ? (
              <p className="hr-note">正在讀取 {selectedRankingMonth.replace("-", " 年 ")} 月排名…</p>
            ) : ranking ? (
              <section className="hr-performance-ranking" aria-label="業績排名">
                <h4>
                  {selectedRankingMonth.replace("-", " 年 ")} 月業績排名
                </h4>
                <p className="hr-performance-place">
                  <span>第 <strong>{ranking.rank}</strong> 名</span>
                  <span className="hr-performance-participants">
                    ／{ranking.participantCount} 人
                  </span>
                </p>
                <dl className="hr-performance-metrics">
                  <div>
                    <dt>當月接單業績</dt>
                    <dd>{money(ranking.performanceAmount)}</dd>
                  </div>
                  <div>
                    <dt>客服服務積分</dt>
                    <dd>{ranking.customerServicePoints} 點</dd>
                  </div>
                </dl>
              </section>
            ) : rankingError ? null : (
              <p className="hr-note">該月份暫無排名資料。</p>
            )}
          </div>
          );
        })
      )}
    </section>
  );
}
function Progress({ title, current, target }: { title: string; current: number; target: number }) {
  return (
    <div className="hr-progress">
      <p>
        <span>{title}</span>
        <strong>
          {money(current)} / {money(target)}
        </strong>
      </p>
      <progress value={Math.min(target, Math.max(0, current))} max={target} />
    </div>
  );
}
