"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, RefreshCw, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatTaipeiDateTime } from "@/lib/taipeiTime";

export type WorkReport = {
  id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  staff_id: string;
  staff_name?: string | null;
  order_type: string;
  service_name: string;
  order_amount: number;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  submitted_at?: string | null;
};

export default function WorkReportReviewPanel({
  appKey,
  accent = "sky",
  onApprove,
}: {
  appKey: "deepnight" | "qiunai";
  accent?: "sky" | "pink";
  onApprove: (report: WorkReport) => Promise<string>;
}) {
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const accentClasses =
    accent === "pink"
      ? {
          panel: "border-pink-100 shadow-pink-100",
          button: "bg-pink-50 text-pink-600",
        }
      : {
          panel: "border-sky-100 shadow-sky-100",
          button: "bg-sky-50 text-sky-600",
        };
  const salaryTable =
    appKey === "deepnight" ? "play_orders" : "qiunai_salary_orders";

  const load = useCallback(async () => {
    setLoading(true);
    const statuses = appKey === "deepnight" ? ["work_pending"] : ["工時待審核"];
    const { data, error } = await supabase
      .from(salaryTable)
      .select("*")
      .in("status", statuses)
      .order("order_finished_at", { ascending: true });
    if (error) console.error("load work reports error", error);
    setReports(
      (data || []).map((row: any) => {
        let meta: any = {};
        try {
          meta = JSON.parse(row.note || row.admin_note || "{}");
        } catch {}
        return {
          id: row.id,
          customer_id: meta.customerId || row.customer_id || null,
          customer_name: meta.customerName || row.customer_name || null,
          staff_id: row.discord_id,
          staff_name: row.staff_name,
          order_type: meta.orderType || row.order_type || "訂單",
          service_name:
            meta.serviceName || row.service_name || row.service || "陪玩服務",
          order_amount: Number(
            row.order_amount || row.final_price || row.price || 0
          ),
          started_at: meta.startedAt || row.accepted_at || row.paid_at,
          ended_at: meta.endedAt || row.order_finished_at || row.completed_at,
          duration_minutes: Number(
            meta.durationMinutes || row.duration_minutes || 0
          ),
          submitted_at: row.order_finished_at,
        } as WorkReport;
      })
    );
    setLoading(false);
  }, [appKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(report: WorkReport) {
    if (
      !confirm(`確定通過 ${report.staff_name || report.staff_id} 的工時申報？`)
    )
      return;
    setWorkingId(report.id);
    try {
      await onApprove(report);
      await load();
    } catch (error: any) {
      alert(`審核失敗：${error?.message || "未知錯誤"}`);
    } finally {
      setWorkingId("");
    }
  }

  async function reject(report: WorkReport) {
    const reason = prompt("請輸入駁回原因：")?.trim();
    if (!reason) return;
    setWorkingId(report.id);
    const rejectPayload =
      appKey === "deepnight"
        ? { status: "work_rejected", note: `工時申報駁回：${reason}` }
        : {
            status: "工時已駁回",
            deleted_reason: reason,
            edited_at: new Date().toISOString(),
            edited_by: "salary_admin",
          };
    const { error } = await supabase
      .from(salaryTable)
      .update(rejectPayload)
      .eq("id", report.id)
      .in("status", appKey === "deepnight" ? ["work_pending"] : ["工時待審核"]);
    setWorkingId("");
    if (error) return alert(`駁回失敗：${error.message}`);
    await load();
  }

  return (
    <section
      className={`rounded-[28px] border bg-white p-5 shadow-sm ${accentClasses.panel}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <Clock3 size={20} /> 工時申報待審核
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            通過後才會寫入陪陪的個人訂單。
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className={`rounded-xl p-2 ${accentClasses.button}`}
          title="重新整理"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {!loading && reports.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
          目前沒有待審核申報
        </p>
      ) : (
        <div className="mt-5 grid gap-3">
          {reports.map((report) => (
            <article
              key={report.id}
              className="grid gap-4 rounded-2xl border border-slate-100 p-4 lg:grid-cols-[1fr_auto] lg:items-center"
            >
              <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <p>
                  <span className="text-slate-400">陪陪</span>
                  <br />
                  <b>{report.staff_name || report.staff_id}</b>
                </p>
                <p>
                  <span className="text-slate-400">老闆／項目</span>
                  <br />
                  <b>
                    {report.customer_name || report.customer_id || "未填寫"}／
                    {report.service_name}
                  </b>
                </p>
                <p>
                  <span className="text-slate-400">時間</span>
                  <br />
                  <b>
                    {formatTaipeiDateTime(report.started_at)} 至{" "}
                    {formatTaipeiDateTime(report.ended_at)}
                  </b>
                </p>
                <p>
                  <span className="text-slate-400">時長／金額</span>
                  <br />
                  <b>
                    {Math.floor(report.duration_minutes / 60)} 小時{" "}
                    {report.duration_minutes % 60} 分／NT$
                    {Number(report.order_amount).toLocaleString("zh-TW")}
                  </b>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={workingId === report.id}
                  onClick={() => approve(report)}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  <Check size={16} />
                  通過
                </button>
                <button
                  type="button"
                  disabled={workingId === report.id}
                  onClick={() => reject(report)}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  <X size={16} />
                  駁回
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
