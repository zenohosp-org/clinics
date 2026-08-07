import { ChevronLeft, ChevronRight } from "lucide-react";

function Pagination({ currentPage, totalPages, totalItems, pageSize, onPageChange }) {
  if (totalPages <= 1) return null;
  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("…");
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div className="hms-pager">
      <p className="hms-pager__count">
        Showing <strong>{from}–{to}</strong> of <strong>{totalItems}</strong>
      </p>
      <div className="hms-pager__nav">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="hms-pager__btn"
        >
          <ChevronLeft className="w-3 h-3" />
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="hms-pager__ellipsis">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`hms-pager__btn ${currentPage === p ? "is-active" : ""}`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="hms-pager__btn"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export { Pagination as default };
