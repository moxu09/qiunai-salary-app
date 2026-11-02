"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
type Career = {
  key: string;
  currentRate: number;
  currentLabel: string;
  monthlyCreditedSalary: number;
  thisYearSalary: number;
  ranking?: {
    month?: string;
    rank: number;
    participantCount: number;
    performanceAmount: number;
    customerServicePoints: number;
  } | null;
};
const money = (value: number) => `$${Number(value || 0).toLocaleString("zh-TW")}`;
export default function HrCareerPanel() {
  const [data, setData] = useState<Career[]>([]);
  const [error, setError] = useState("");
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
  return (
    <section className="hr-card">
      <h2>我的抽成與業績</h2>
      <p className="hr-note">依各部門原有制度計算，兩家店的升級資格各自保留。</p>
      {error ? (
        <p role="alert" className="hr-error">
          {error}
        </p>
      ) : !data.length ? (
        <p className="hr-note">讀取業績中…</p>
      ) : (
        data.map((commissionInfo) => (
          <div className="hr-career-department" key={commissionInfo.key}>
            <h3>
              {commissionInfo.key === "qiunai" ? "秋奈電競" : "深夜不關燈"} ·{" "}
              {commissionInfo.currentRate}%
            </h3>
            <p className="hr-note">{commissionInfo.currentLabel}</p>
            <Progress
              title={
                commissionInfo.key === "qiunai"
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
            {commissionInfo.key === "qiunai" ? (
              <p className="hr-note">
                85% 依當月一般訂單＋打賞金額判定，滿 10,000 元後隔月生效一個月；90%
                依今年薪資進度，達標後隔年生效一年。2027年將會有新制度改革。
              </p>
            ) : null}
            {commissionInfo.ranking ? (
              <section className="hr-performance-ranking" aria-label="本月業績排名">
                <h4>
                  {commissionInfo.ranking.month
                    ? `${commissionInfo.ranking.month.replace("-", " 年 ")} 月業績排名`
                    : "本月業績排名"}
                </h4>
                <p className="hr-performance-place">
                  <span>第 <strong>{commissionInfo.ranking.rank}</strong> 名</span>
                  <span className="hr-performance-participants">
                    ／{commissionInfo.ranking.participantCount} 人
                  </span>
                </p>
                <dl className="hr-performance-metrics">
                  <div>
                    <dt>本月接單業績</dt>
                    <dd>{money(commissionInfo.ranking.performanceAmount)}</dd>
                  </div>
                  <div>
                    <dt>客服服務積分</dt>
                    <dd>{commissionInfo.ranking.customerServicePoints} 點</dd>
                  </div>
                </dl>
              </section>
            ) : null}
          </div>
        ))
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
