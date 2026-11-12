"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 6;

export default function CompactOrderList<T extends { id: string }>({
  orders,
  renderOrder,
  renderFullTable,
  onFilter,
  onCreate,
  loading,
}: {
  orders: T[];
  renderOrder: (order: T) => ReactNode;
  renderFullTable: () => ReactNode;
  onFilter: () => void;
  onCreate: () => void;
  loading: boolean;
}) {
  const [page, setPage] = useState(0);
  const [full, setFull] = useState(false);
  const pages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);

  return (
    <div className="min-w-0 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-xs text-slate-600">
        <span>{loading ? "讀取中…" : `${orders.length} 筆訂單`}</span>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={onFilter} className="rounded-md px-2 py-1.5 font-bold text-slate-700 hover:bg-slate-50">篩選</button>
          <button type="button" onClick={onCreate} className="rounded-md px-2 py-1.5 font-bold text-slate-700 hover:bg-slate-50">新增訂單</button>
          <button type="button" aria-pressed={full} onClick={() => setFull(!full)} className="rounded-md border border-slate-200 px-2 py-1.5 font-bold text-slate-700 hover:bg-slate-50">
            {full ? "回精簡列表" : "完整欄位與操作"}
          </button>
        </div>
      </div>
      {full ? renderFullTable() : (
        <>
          {!loading && orders.length === 0 ? (
            <p className="p-3 text-xs text-slate-500">沒有符合條件的訂單</p>
          ) : null}
          <ul className="divide-y divide-slate-100">
            {orders.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(order => (
              <li key={order.id} className="px-3 py-2.5">{renderOrder(order)}</li>
            ))}
          </ul>
          {pages > 1 ? (
            <nav aria-label="訂單列表分頁" className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
              <button type="button" aria-label="上一頁" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-30">
                <ChevronLeft size={16} />
              </button>
              <span>{currentPage + 1} / {pages}</span>
              <button type="button" aria-label="下一頁" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)} className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-30">
                <ChevronRight size={16} />
              </button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
