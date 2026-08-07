/**
 * Lightweight table.
 *
 * Props
 *   columns   Array<{
 *               header:   ReactNode,                    // <th> content
 *               accessor: string | (row, idx) => any,   // value extractor when no `render`
 *               render:   (row, idx) => ReactNode,      // custom cell renderer (wins over accessor)
 *               align:    "left" | "center" | "right",
 *               width:    css length (passed to colgroup),
 *               className: string,
 *             }>
 *   data      Array<row>
 *   rowKey    (row, idx) => string|number              // default: row.id ?? idx
 *   loading   boolean
 *   loadingMessage ReactNode (default "Loading…")
 *   emptyMessage   ReactNode (default "No data")
 *   onRowClick     (row, idx) => void                  // optional row click
 *   className extra classes appended to the wrapper
 */
import TableSkeleton from "./TableSkeleton";

export default function Table({
    columns = [],
    data = [],
    rowKey,
    loading = false,
    loadingMessage = <TableSkeleton rows={8} />,
    emptyMessage = "No data",
    onRowClick,
    className = "",
}) {
    const getValue = (row, col, idx) => {
        if (typeof col.render === "function") return col.render(row, idx);
        if (typeof col.accessor === "function") return col.accessor(row, idx);
        if (typeof col.accessor === "string") return row?.[col.accessor];
        return null;
    };

    const keyFor = (row, idx) => {
        if (typeof rowKey === "function") return rowKey(row, idx);
        if (row && row.id !== undefined) return row.id;
        return idx;
    };

    return (
        <div className={`zu-table-wrapper ${className}`.trim()}>
            <table className="zu-table">
                {columns.some((c) => c.width) && (
                    <colgroup>
                        {columns.map((c, i) => (
                            <col key={i} style={c.width ? { width: c.width } : undefined} />
                        ))}
                    </colgroup>
                )}
                <thead>
                    <tr>
                        {columns.map((c, i) => (
                            <th
                                key={i}
                                style={c.align ? { textAlign: c.align } : undefined}
                                className={c.className}
                            >
                                {c.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr>
                            <td colSpan={columns.length} className="zu-table-loading-cell">
                                {typeof loadingMessage === 'string' ? (
                                    <div className="zu-table-loading">{loadingMessage}</div>
                                ) : (
                                    loadingMessage
                                )}
                            </td>
                        </tr>
                    ) : data.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length}>
                                <div className="zu-table-loading">{emptyMessage}</div>
                            </td>
                        </tr>
                    ) : (
                        data.map((row, idx) => (
                            <tr
                                key={keyFor(row, idx)}
                                onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
                                style={onRowClick ? { cursor: "pointer" } : undefined}
                            >
                                {columns.map((c, i) => (
                                    <td
                                        key={i}
                                        style={c.align ? { textAlign: c.align } : undefined}
                                        className={c.className}
                                    >
                                        {getValue(row, c, idx)}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
