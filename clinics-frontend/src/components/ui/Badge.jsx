/**
 * Status badge — pill or soft chip.
 *
 * Props
 *   tone   "success" | "warning" | "danger" | "info" | "neutral"   default "neutral"
 *   soft   boolean — soft pill style (lowercase, no tracking)
 *   className extra classes appended
 *   ...rest forwarded to the span
 */
export default function Badge({ tone = "neutral", soft = false, className = "", children, ...rest }) {
    const classes = ["zu-badge", `zu-badge-${tone}`, soft && "is-soft", className]
        .filter(Boolean)
        .join(" ");
    return (
        <span className={classes} {...rest}>
            {children}
        </span>
    );
}
