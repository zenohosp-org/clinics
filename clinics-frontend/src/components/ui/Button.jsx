import { forwardRef } from "react";

/**
 * HMS design-system button.
 *
 * Renders the shared base class .zu-btn-{variant} plus modifier flags.
 * All styling lives in src/styles/hms-system.css — this file is a thin
 * shell so the markup at every callsite stays identical.
 *
 * Props
 *   variant   "primary" | "secondary" | "cancel" | "danger" | "ghost" | "icon" | "circle"   default "primary"
 *   size      "md" | "sm"   default "md"
 *   color     "default" | "blue" | "orange" | "green"   primary/secondary only — default "default"
 *   full      boolean   stretches to width:100%
 *   loading   boolean   shows spinner overlay; auto-disables clicks
 *   outline   boolean   danger only — switches to outlined treatment
 *   className extra classes appended after design-system classes
 *   ...rest   forwarded to native <button>
 */
const Button = forwardRef(function Button(
    {
        variant = "primary",
        size = "md",
        color = "default",
        full = false,
        loading = false,
        outline = false,
        className = "",
        type = "button",
        children,
        ...rest
    },
    ref
) {
    const base = `zu-btn-${variant}`;
    const modifiers = [
        size === "sm" && "is-sm",
        full && "is-full",
        loading && "is-loading",
        outline && variant === "danger" && "is-outline",
        color !== "default" && (variant === "primary" || variant === "secondary") && `is-${color}`,
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <button
            ref={ref}
            type={type}
            className={`${base} ${modifiers} ${className}`.trim()}
            aria-busy={loading || undefined}
            disabled={loading || rest.disabled}
            {...rest}
        >
            {children}
        </button>
    );
});

export default Button;
