import React from "react";

export default function TableSkeleton({ rows = 5, columns = 4 }) {
    return (
        <div className="zu-table-skeleton">
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <div key={rowIndex} className="zu-table-skeleton-row">
                    {Array.from({ length: columns }).map((_, colIndex) => (
                        <div
                            key={colIndex}
                            className={`zu-table-skeleton-cell ${
                                colIndex === 0 ? "is-wide" : colIndex === columns - 1 ? "is-narrow" : ""
                            }`}
                        ></div>
                    ))}
                </div>
            ))}
        </div>
    );
}
