"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { serviceRequest } from "./client";
import { storeName, type Department } from "./types";
import {
  Boxes,
  ClipboardCheck,
  Crown,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from "lucide-react";

// Service responses combine rows from several operational tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

type RejectRequest = {
  title: string;
  payload: Row;
};

export type ReviewData = Row & { department: Department; departments: { key: Department; name: string }[] };

export default function ServiceReview({ department, initial }: { department: Department; initial: ReviewData }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(initial);
  const api = `/service/api/reviews?department=${department}`;
  const [tab, setTab] = useState("reports");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejectRequest, setRejectRequest] = useState<RejectRequest | null>(null);
  const [rejectError, setRejectError] = useState("");
  const rejectNoteRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [adjust, setAdjust] = useState({
    discordUserId: "",
    pointKind: "membership",
    delta: "",
    note: "",
  });
  const [reward, setReward] = useState({
    id: "",
    name: "",
    description: "",
    rewardType: "prize",
    pointsCost: "",
    stock: "",
    status: "active",
    couponName: "",
    eligibleTierKeys: [
      "star_traveler",
      "silver_wing",
      "gold_wing",
      "radiant_star",
      "obsidian",
      "exclusive",
    ],
  });
  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await serviceRequest(api));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "讀取失敗");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!rejectRequest) return;
    rejectNoteRef.current?.focus();
  }, [rejectRequest]);
  async function action(payload: Row) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await serviceRequest(api, payload);
      setMessage("操作已完成");
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗");
      return false;
    } finally {
      setBusy(false);
    }
  }
  function openReject(title: string, payload: Row) {
    setRejectRequest({ title, payload });
    setRejectError("");
  }
  async function submitReject() {
    const note = rejectNoteRef.current?.value.trim() || "";
    if (!note) {
      setRejectError("請輸入駁回原因");
      return;
    }
    if (!rejectRequest) return;
    const succeeded = await action({ ...rejectRequest.payload, note });
    if (succeeded) {
      setRejectRequest(null);
      setRejectError("");
    }
  }
  const profileByDiscord = useMemo(
    () =>
      new Map(
        (data?.profiles || []).map((profile: Row) => [
          String(profile.discord_user_id),
          profile,
        ]),
      ),
    [data],
  );
  const invitationByDiscord = useMemo(() => {
    const map = new Map<string, Row>();
    for (const invitation of data?.exclusiveInvitations || []) {
      const discordId = String(invitation.discord_user_id);
      if (!map.has(discordId)) map.set(discordId, invitation);
    }
    return map;
  }, [data]);
  const members = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.members || [])
      .filter((m: Row) => {
        const profile = profileByDiscord.get(String(m.discord_user_id)) as
          | Row
          | undefined;
        const displayName =
          m.custom_display_name || m.display_name || profile?.display_name || "";
        return (
          !q ||
          String(displayName).toLowerCase().includes(q) ||
          String(m.discord_user_id).includes(q)
        );
      })
      .sort(
        (a: Row, b: Row) =>
          Number(b.lifetime_points || 0) - Number(a.lifetime_points || 0),
      );
  }, [data, profileByDiscord, search]);
  return (
    <section className="svc-page svc-review">
      <div className="svc-page-heading">
        <span className="svc-kicker"><ClipboardCheck size={17}/> {storeName(department)}</span>
        <h1>待審核訂單</h1>
        <p>處理本店訂單與打賞，也可切換會員審核及兌換商品。</p>
      </div>
      <div className="svc-panel svc-review-body" aria-busy={loading}>
        <div className="svc-section-title"><h2>審核工作</h2><button type="button" className="svc-secondary" onClick={()=>void load()} disabled={loading||busy}><RefreshCw size={16}/>重新讀取</button></div>
        {message && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        )}
        <nav className="svc-review-tabs" aria-label="審核分類">
          {[
            [
              "reports",
              "訂單與打賞",
              ClipboardCheck,
              (data.reports || []).length,
            ],
            ["members", "會員審核", Users, (data.redemptions || []).length],
            ["rewards", "兌換商品", Boxes, (data.rewards || []).length],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ].map(([key, label, Icon, count]: any) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className="svc-secondary"
            >
              <Icon size={17} />
              {label}
              <span className="svc-review-count">{count}</span>
            </button>
          ))}
        </nav>

        {tab === "reports" && (
          <section className="mt-5">
            <SectionTitle
              title="待審工時報單"
              text="核對本店工時申報後通過或駁回。"
            />
            {(data.reports || []).length ? (
              <div className="svc-review-orders">
                {data.reports.map((report: Row) => (
                  <article key={`${report.brand}-${report.id}`} className="svc-review-order">
                    <div className="svc-review-order-title">
                      <span className="svc-badge">{report.meta?.orderType || report.order_type || "訂單"}</span>
                      <h3>{report.service_name || report.service || report.meta?.serviceName || "陪玩服務"}</h3>
                    </div>
                    <dl>
                      <div><dt>陪陪</dt><dd>{report.staff_name || report.discord_id}</dd></div>
                      <div><dt>老闆</dt><dd>{report.customer_name || report.meta?.customerName || report.meta?.customerId || "未填寫"}</dd></div>
                      <div><dt>金額</dt><dd>{Number(report.order_amount || report.price || 0).toLocaleString("zh-TW")} ASD</dd></div>
                      <div><dt>時長</dt><dd>{Number(report.duration_minutes || report.meta?.durationMinutes || 0)} 分</dd></div>
                    </dl>
                    <div className="svc-actions">
                      <button type="button" disabled={busy || loading} onClick={()=>{
                        if(window.confirm("確定通過這筆申報？"))void action({action:"review_report",brand:report.brand,reportId:report.id,approved:true});
                      }}>通過</button>
                      <button type="button" className="svc-secondary svc-review-reject" disabled={busy || loading} onClick={()=>
                        openReject("駁回工時報單",{action:"review_report",brand:report.brand,reportId:report.id,approved:false})
                      }>駁回</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty text="目前沒有待審工時報單" />
            )}

            <div className="mt-8">
              <SectionTitle
                title="最近審核紀錄"
                text="核准與駁回都會保留審核人、時間與原因，最近紀錄顯示在這裡。"
              />
              {(data.reviewHistory || []).length ? (
                <div className="overflow-x-auto rounded-lg border border-[#d8e3dd] bg-white shadow-sm">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="bg-[#f6f9f7] text-xs font-bold text-slate-500">
                      <tr>
                        {[
                          "品牌",
                          "陪陪",
                          "類型／項目",
                          "結果",
                          "審核人",
                          "審核時間",
                          "原因",
                        ].map((label) => (
                          <th key={label} className="px-4 py-3">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.reviewHistory.map((review: Row) => (
                        <tr
                          key={`${review.brand}-${review.id}`}
                          className="transition hover:bg-[#f8faf9]"
                        >
                          <td className="px-4 py-4 font-bold">
                            {review.brand === "deepnight" ? "深夜" : "秋奈"}
                          </td>
                          <td className="px-4 py-4">
                            {review.staff_name || review.discord_id}
                          </td>
                          <td className="px-4 py-4">
                            {review.order_type || "訂單"}
                            <br />
                            <span className="text-xs text-slate-400">
                              {review.service_name || review.service || "-"}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-bold ${review.review_decision === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                            >
                              {review.review_decision === "approved"
                                ? "已核准"
                                : "已駁回"}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-semibold">
                              {review.reviewer_name || "未知審核人"}
                            </p>
                            {review.reviewer_discord_id && (
                              <p className="mt-1 text-xs text-slate-400">
                                {review.reviewer_discord_id}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {formatTaipeiDateTime(review.reviewed_at)}
                          </td>
                          <td className="max-w-[240px] px-4 py-4 text-slate-500">
                            {review.review_reason || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty text="目前尚無審核紀錄" />
              )}
            </div>
          </section>
        )}

        {tab === "members" && (
          <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.4fr]">
            <div>
              <SectionTitle
                title="兌換申請"
                text="審核商品、優惠券與自訂折價券。"
              />
              {(data.redemptions || []).length ? (
                <div className="space-y-3">
                  {data.redemptions.map((r: Row) => (
                    <article
                      key={r.id}
                      className="rounded-lg border border-[#d8e3dd] bg-white p-4 shadow-sm"
                    >
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-bold">{r.reward_name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {r.discord_user_id} ·{" "}
                            {Number(r.points_spent).toLocaleString()} 點
                          </p>
                        </div>
                        {r.discount_amount && (
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-800">
                            折 {r.discount_amount} ASD
                          </span>
                        )}
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button
                          disabled={busy}
                          onClick={() =>
                            action({
                              action: "review_redemption",
                              requestId: r.id,
                              approved: true,
                            })
                          }
                          className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                        >
                          同意
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            openReject("駁回兌換申請", {
                              action: "review_redemption",
                              requestId: r.id,
                              approved: false,
                            })
                          }
                          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          駁回
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty text="目前沒有待審兌換" />
              )}
            </div>
            <div>
              <SectionTitle
                title="會員與積分調整"
                text="客服可依 Discord ID 增減會籍或獎勵積分，所有異動都會留下紀錄。"
              />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  action({
                    action: "adjust_points",
                    ...adjust,
                    delta: Number(adjust.delta),
                  });
                }}
                className="grid gap-3 rounded-lg border border-[#d8e3dd] bg-white p-4 shadow-sm md:grid-cols-[1fr_150px_130px_1fr_auto]"
              >
                <input
                  required
                  value={adjust.discordUserId}
                  onChange={(e) =>
                    setAdjust({ ...adjust, discordUserId: e.target.value })
                  }
                  placeholder="Discord ID"
                  className="rounded-md border border-slate-200 bg-[#fbfcfb] px-3 py-2 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
                <select
                  value={adjust.pointKind}
                  onChange={(e) =>
                    setAdjust({ ...adjust, pointKind: e.target.value })
                  }
                  className="rounded-md border border-slate-200 bg-[#fbfcfb] px-3 py-2 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="membership">會籍積分</option>
                  <option value="reward">獎勵積分</option>
                </select>
                <input
                  required
                  type="number"
                  step="0.01"
                  value={adjust.delta}
                  onChange={(e) =>
                    setAdjust({ ...adjust, delta: e.target.value })
                  }
                  placeholder="增減數值"
                  className="rounded-md border border-slate-200 bg-[#fbfcfb] px-3 py-2 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
                <input
                  required
                  value={adjust.note}
                  onChange={(e) =>
                    setAdjust({ ...adjust, note: e.target.value })
                  }
                  placeholder="調整原因"
                  className="rounded-md border border-slate-200 bg-[#fbfcfb] px-3 py-2 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  disabled={busy}
                  className="rounded-md bg-[#183d32] px-4 py-2 font-bold text-white transition hover:bg-[#102f27] disabled:opacity-50"
                >
                  確定
                </button>
              </form>
              <div className="mt-4 flex items-center rounded-lg border border-[#d8e3dd] bg-white px-3 shadow-sm focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
                <Search size={17} className="text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜尋名稱或 Discord ID"
                  className="w-full px-3 py-3 outline-none"
                />
              </div>
              <div className="mt-3 max-h-[560px] overflow-auto rounded-lg border border-[#d8e3dd] bg-white shadow-sm">
                <table className="w-full min-w-[1060px] text-left text-sm">
                  <thead className="sticky top-0 bg-[#f3f7f5] text-xs font-bold text-slate-500 shadow-[0_1px_0_#d8e3dd]">
                    <tr>
                      {[
                        "會員",
                        "會籍",
                        "會籍積分",
                        "獎勵積分",
                        "基本資料",
                        "錢包連結",
                        "尊享邀請",
                        "客服權限",
                      ].map((x) => (
                          <th key={x} className="px-4 py-3">
                            {x}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {members.map((m: Row) => {
                      const tier = data.tiers.find(
                        (t: Row) => t.tier_key === m.tier_key,
                      );
                      const linkedProfile = profileByDiscord.get(
                        String(m.discord_user_id),
                      ) as Row | undefined;
                      const invitation = invitationByDiscord.get(
                        String(m.discord_user_id),
                      );
                      return (
                        <tr key={m.discord_user_id} className="transition hover:bg-[#f8faf9]">
                          <td className="px-4 py-3">
                            <p className="font-bold">
                              {m.custom_display_name ||
                                m.display_name ||
                                linkedProfile?.display_name ||
                                `Discord ${m.discord_user_id}`}
                            </p>
                            <button
                              onClick={() =>
                                setAdjust({
                                  ...adjust,
                                  discordUserId: m.discord_user_id,
                                })
                              }
                              className="text-xs text-emerald-700 hover:underline"
                            >
                              {m.discord_user_id}
                            </button>
                          </td>
                          <td className="px-4 py-3">{tier?.tier_name}</td>
                          <td className="px-4 py-3">
                            {Number(m.lifetime_points).toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            {Number(m.reward_points).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-xs leading-6 text-slate-600">
                            <span className="font-bold text-slate-800">
                              {genderLabel(m.gender)}
                            </span>
                            <br />
                            {m.birth_month && m.birth_day
                              ? `${m.birth_month} 月 ${m.birth_day} 日`
                              : "生日未填"}
                          </td>
                          <td className="px-4 py-3">
                            {m.auth_user_id ? "已連結" : "首次登入時連結"}
                          </td>
                          <td className="px-4 py-3">
                            {m.tier_key === "exclusive" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
                                <Crown size={13} />
                                尊享會員
                              </span>
                            ) : invitation?.status === "pending" ? (
                              <span className="rounded-full bg-[#e5f1eb] px-2.5 py-1 text-xs font-bold text-emerald-800">
                                等待回覆
                              </span>
                            ) : (
                              <button
                                disabled={busy}
                                onClick={() =>
                                  action({
                                    action: "invite_exclusive_member",
                                    discordUserId: m.discord_user_id,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100 disabled:opacity-40"
                              >
                                <Crown size={14} />
                                {invitation?.status === "declined"
                                  ? "再次邀請"
                                  : "邀請尊享"}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {linkedProfile?.role === "admin" ? (
                              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
                                管理員
                              </span>
                            ) : data.actorRole === "admin" ? (
                              <button
                                disabled={!linkedProfile || busy}
                                onClick={() =>
                                  action({
                                    action: "set_staff_role",
                                    discordUserId: m.discord_user_id,
                                    enabled: linkedProfile?.role !== "staff",
                                  })
                                }
                                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold transition hover:bg-slate-50 disabled:opacity-40"
                              >
                                {!linkedProfile
                                  ? "尚未登入"
                                  : linkedProfile.role === "staff"
                                    ? "移除客服"
                                    : "設為客服"}
                              </button>
                            ) : (
                              <span>
                                {linkedProfile?.role === "staff"
                                  ? "客服"
                                  : "一般會員"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {tab === "rewards" && (
          <section className="mt-5 grid gap-5 lg:grid-cols-[380px_1fr]">
            <div>
              <SectionTitle
                title={reward.id ? "編輯兌換商品" : "新增兌換商品"}
                text="儲存後會員端會立即顯示。"
              />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  action({
                    action: "save_reward",
                    ...reward,
                    pointsCost: Number(reward.pointsCost),
                  });
                  setReward({
                    id: "",
                    name: "",
                    description: "",
                    rewardType: "prize",
                    pointsCost: "",
                    stock: "",
                    status: "active",
                    couponName: "",
                    eligibleTierKeys: (data.tiers || []).map(
                      (tier: Row) => tier.tier_key,
                    ),
                  });
                }}
                className="space-y-3 rounded-lg border border-[#d8e3dd] bg-white p-4 shadow-sm"
              >
                <Field label="商品名稱">
                  <input
                    required
                    value={reward.name}
                    onChange={(e) =>
                      setReward({ ...reward, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="說明">
                  <textarea
                    value={reward.description}
                    onChange={(e) =>
                      setReward({ ...reward, description: e.target.value })
                    }
                  />
                </Field>
                <Field label="類型">
                  <select
                    value={reward.rewardType}
                    onChange={(e) =>
                      setReward({ ...reward, rewardType: e.target.value })
                    }
                  >
                    <option value="prize">實體／一般獎品</option>
                    <option value="coupon">優惠券</option>
                    <option value="discount_coupon">折價券</option>
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="所需積分">
                    <input
                      required
                      type="number"
                      min="1"
                      value={reward.pointsCost}
                      onChange={(e) =>
                        setReward({ ...reward, pointsCost: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="庫存（空白不限）">
                    <input
                      type="number"
                      min="0"
                      value={reward.stock}
                      onChange={(e) =>
                        setReward({ ...reward, stock: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field label="狀態">
                  <select
                    value={reward.status}
                    onChange={(e) =>
                      setReward({ ...reward, status: e.target.value })
                    }
                  >
                    <option value="active">可兌換</option>
                    <option value="paused">停換</option>
                  </select>
                </Field>
                <div>
                  <p className="text-sm font-bold text-slate-700">
                    可兌換會員等級
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(data.tiers || []).map((tier: Row) => {
                      const checked = reward.eligibleTierKeys.includes(
                        tier.tier_key,
                      );
                      return (
                        <label
                          key={tier.tier_key}
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-[#fbfcfb] px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setReward({
                                ...reward,
                                eligibleTierKeys: checked
                                  ? reward.eligibleTierKeys.filter(
                                      (key: string) => key !== tier.tier_key,
                                    )
                                  : [
                                      ...reward.eligibleTierKeys,
                                      tier.tier_key,
                                    ],
                              })
                            }
                          />
                          <span>{tier.tier_name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <button
                  disabled={busy || reward.eligibleTierKeys.length === 0}
                  className="w-full rounded-md bg-[#183d32] px-4 py-3 font-bold text-white transition hover:bg-[#102f27] disabled:opacity-50"
                >
                  {reward.id ? "儲存修改" : "新增商品"}
                </button>
              </form>
            </div>
            <div>
              <SectionTitle
                title="會員兌換商品列表"
                text="可修改、停換或刪除商品。"
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data.rewards.map((r: Row) => (
                  <article
                    key={r.id}
                    className="rounded-lg border border-[#d8e3dd] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-[#e5f1eb] text-emerald-800"><Boxes size={19} /></span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${r.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                      >
                        {r.status === "active" ? "可兌換" : "已停換"}
                      </span>
                    </div>
                    <h3 className="mt-4 font-black">{r.name}</h3>
                    <p className="mt-2 min-h-10 text-sm text-slate-500">
                      {r.description || "無說明"}
                    </p>
                    <p className="mt-4 font-bold text-emerald-800">
                      {Number(r.points_cost).toLocaleString()} 點
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      庫存：{r.stock == null ? "不限" : r.stock}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(data.tiers || [])
                        .filter((tier: Row) =>
                          (r.eligible_tier_keys || []).includes(tier.tier_key),
                        )
                        .map((tier: Row) => (
                          <span
                            key={tier.tier_key}
                            className="rounded-full bg-[#e5f1eb] px-2 py-1 text-[11px] font-bold text-emerald-800"
                          >
                            {tier.tier_name}
                          </span>
                        ))}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() =>
                          setReward({
                            id: r.id,
                            name: r.name,
                            description: r.description || "",
                            rewardType: r.reward_type,
                            pointsCost: String(r.points_cost),
                            stock: r.stock == null ? "" : String(r.stock),
                            status: r.status,
                            couponName: r.coupon_name || "",
                            eligibleTierKeys: r.eligible_tier_keys || [],
                          })
                        }
                        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-xs font-bold transition hover:bg-slate-50"
                      >
                        編輯
                      </button>
                      <button
                        title="刪除"
                        onClick={() =>
                          confirm("確定刪除？") &&
                          action({ action: "delete_reward", id: r.id })
                        }
                        className="grid h-9 w-9 place-items-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
      {rejectRequest && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-dialog-title"
          data-no-translate
        >
          <form
            className="w-full max-w-md rounded-xl border border-[#d8e3dd] bg-white p-6 shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              void submitReject();
            }}
          >
            <p className="text-xs font-bold text-red-600">客服審核</p>
            <h2
              id="reject-dialog-title"
              className="mt-1 text-xl font-black text-[#183d32]"
            >
              {rejectRequest.title}
            </h2>
            <label className="mt-5 block text-sm font-bold text-slate-700">
              駁回原因
              <input
                id="service-rejection-reason"
                name="rejection_reason"
                type="text"
                ref={rejectNoteRef}
                inputMode="text"
                autoComplete="off"
                onInput={() => {
                  if (rejectError) setRejectError("");
                }}
                placeholder="請輸入要提供給申請人的駁回原因"
                className="mt-2 h-12 w-full rounded-md border border-slate-200 bg-[#fbfcfb] px-3 py-2 text-slate-900 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
              />
            </label>
            {rejectError && (
              <p className="mt-2 text-sm font-semibold text-red-600">
                {rejectError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setRejectRequest(null);
                  setRejectError("");
                }}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-w-24 items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="animate-spin" size={17} />
                ) : (
                  "確認駁回"
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function SectionTitle({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-black text-[#183d32]">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  );
}
function genderLabel(value: string | null | undefined) {
  return (
    {
      female: "女性",
      male: "男性",
      other: "其他",
      undisclosed: "不公開",
    }[String(value || "undisclosed")] || "不公開"
  );
}
function formatTaipeiDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });
}
function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#cbd9d2] bg-white/70 p-10 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-bold text-slate-700">
      {label}
      <div className="mt-1 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-slate-200 [&_input]:bg-[#fbfcfb] [&_input]:px-3 [&_input]:py-2 [&_input]:outline-none [&_input]:focus:border-emerald-500 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-slate-200 [&_select]:bg-[#fbfcfb] [&_select]:px-3 [&_select]:py-2 [&_select]:outline-none [&_select]:focus:border-emerald-500 [&_textarea]:min-h-20 [&_textarea]:w-full [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-slate-200 [&_textarea]:bg-[#fbfcfb] [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:outline-none [&_textarea]:focus:border-emerald-500">
        {children}
      </div>
    </label>
  );
}
