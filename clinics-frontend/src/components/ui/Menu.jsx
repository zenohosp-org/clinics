import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Menu — portalled dropdown popover.
 *
 * Why portalled
 *   The kebab popover used to be inline JSX inside a table cell. Tables
 *   need `overflow: hidden` for their rounded corners, which clipped the
 *   menu for any row near the bottom edge — the user could see the
 *   trigger but the menu was sliced in half. Portalling to #modal-root
 *   escapes every ancestor's clipping rect, and a viewport-coord
 *   position computed from the trigger's getBoundingClientRect() keeps
 *   the menu anchored to the trigger regardless of where it lives in
 *   the React tree.
 *
 * Behavioural contract
 *   * Single button trigger.
 *   * Click toggles; click outside / ESC / any-ancestor-scroll closes.
 *   * Resize repositions; if there's no room below, the menu flips to
 *     above. Horizontal clamp keeps it 8px inside the viewport.
 *   * Item click fires onClick, then closes (override per-item via
 *     `closeOnClick: false` if a future use-case needs it).
 *
 * Props
 *   items                Array<MenuItem | { divider: true }>
 *     MenuItem.label      string | node
 *     MenuItem.icon       optional ReactNode
 *     MenuItem.tone       "default" | "danger"   default "default"
 *     MenuItem.onClick    (e) => void
 *     MenuItem.disabled   boolean
 *     MenuItem.key        optional stable key (defaults to label/index)
 *     MenuItem.closeOnClick   default true
 *   align               "left" | "right"     anchor edge — default "right"
 *   placement           "bottom" | "top"     vertical preference — default "bottom"
 *   minWidth            number (px)          default 200
 *   triggerLabel        a11y label on the trigger button (defaults to "Open menu")
 *   triggerIcon         icon node inside the trigger
 *   triggerClassName    className applied to the trigger — default "zu-btn-icon"
 *   onOpenChange        (open: boolean) => void   optional observer
 */
export default function Menu({
    items = [],
    align = "right",
    placement = "bottom",
    minWidth = 200,
    triggerLabel = "Open menu",
    triggerIcon,
    triggerClassName = "zu-btn-icon",
    onOpenChange,
}) {
    const [open, setOpen] = useState(false);
    const [coords, setCoords] = useState({ top: -9999, left: -9999 });
    const triggerRef = useRef(null);
    const menuRef = useRef(null);

    const setOpenState = (next) => {
        setOpen(next);
        onOpenChange?.(next);
    };

    const toggle = (e) => {
        e.stopPropagation();
        setOpenState(!open);
    };

    const close = () => setOpenState(false);

    // Position the menu on open + on resize. useLayoutEffect runs
    // synchronously before paint so the user never sees the offscreen
    // placeholder coords.
    useLayoutEffect(() => {
        if (!open) return;
        const compute = () => {
            const t = triggerRef.current?.getBoundingClientRect();
            const m = menuRef.current;
            if (!t || !m) return;
            const menuHeight = m.offsetHeight || 0;
            const measuredWidth = m.offsetWidth || minWidth;
            const vh = window.innerHeight;
            const vw = window.innerWidth;

            const wantBelow = placement === "bottom";
            const fitsBelow = t.bottom + 6 + menuHeight <= vh;
            const fitsAbove = t.top - 6 - menuHeight >= 8;
            const useBelow = wantBelow ? fitsBelow || !fitsAbove : !fitsAbove && fitsBelow;

            const top = useBelow ? t.bottom + 6 : t.top - menuHeight - 6;
            let left = align === "right" ? t.right - measuredWidth : t.left;
            left = Math.max(8, Math.min(left, vw - measuredWidth - 8));

            setCoords({ top, left });
        };
        compute();
        window.addEventListener("resize", compute);
        return () => window.removeEventListener("resize", compute);
    }, [open, align, placement, minWidth]);

    // Close on outside click, ESC, or any-ancestor scroll (capture phase
    // so a scroll inside a table wrapper also dismisses).
    useEffect(() => {
        if (!open) return;
        const onScroll = () => close();
        const onKey = (e) => {
            if (e.key === "Escape") close();
        };
        const onClick = (e) => {
            if (menuRef.current?.contains(e.target)) return;
            if (triggerRef.current?.contains(e.target)) return;
            close();
        };
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("keydown", onKey);
        document.addEventListener("mousedown", onClick);
        return () => {
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onClick);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const host =
        typeof document !== "undefined"
            ? document.getElementById("modal-root") || document.body
            : null;

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className={triggerClassName}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={triggerLabel}
                onClick={toggle}
            >
                {triggerIcon}
            </button>
            {open &&
                host &&
                createPortal(
                    <div
                        ref={menuRef}
                        role="menu"
                        className="zu-menu"
                        style={{ top: coords.top, left: coords.left, minWidth }}
                    >
                        {items.map((item, i) => {
                            if (item.divider) {
                                return <div key={`d-${i}`} className="zu-menu-divider" />;
                            }
                            const cls = `zu-menu-item${
                                item.tone === "danger"
                                    ? " is-danger"
                                    : item.tone === "warning"
                                    ? " is-warning"
                                    : ""
                            }${item.className ? ` ${item.className}` : ""}`;
                            const handleClick = (e) => {
                                e.stopPropagation();
                                if (item.closeOnClick !== false) close();
                                item.onClick?.(e);
                            };
                            return (
                                <button
                                    key={item.key ?? (typeof item.label === "string" ? item.label : i)}
                                    type="button"
                                    role="menuitem"
                                    className={cls}
                                    disabled={item.disabled}
                                    onClick={handleClick}
                                >
                                    {item.icon && (
                                        <span className="zu-menu-item-icon">
                                            {item.icon}
                                        </span>
                                    )}
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                    </div>,
                    host
                )}
        </>
    );
}
