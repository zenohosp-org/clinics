import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Right-edge slide-in drawer. Drop-in semantic replacement for the
 * legacy SidePane — same prop names where they overlap so callers can
 * migrate by swapping the import.
 *
 * Behavioural contract
 *   * Portals to #modal-root.
 *   * Backdrop click + ESC + X button all call onClose.
 *   * Locks body scroll while open and restores it on close.
 *
 * Props
 *   isOpen      boolean
 *   onClose     () => void
 *   title       string | node — header title
 *   subtitle    string | node — optional sub-line below the title
 *   footer      optional sticky footer node (action row)
 *   width       css length — overrides default 500px panel width
 *   className   extra classes appended to the panel
 *   children    body content
 */
export default function Drawer({
    isOpen,
    onClose,
    title,
    subtitle,
    footer,
    width,
    className = "",
    children,
}) {
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => {
            if (e.key === "Escape") onClose?.();
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", onKey);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const host = (typeof document !== "undefined" && document.getElementById("modal-root")) || document.body;
    const panelStyle = width ? { width } : undefined;

    return createPortal(
        <>
            <div
                className="hms-drawer-overlay"
                onMouseDown={onClose}
                role="presentation"
            />
            <aside
                className={`hms-drawer ${className}`.trim()}
                style={panelStyle}
                role="dialog"
                aria-modal="true"
            >
                <div className="hms-drawer-header">
                    <div>
                        {title && <h3>{title}</h3>}
                        {subtitle && (
                            <div className="hms-page-subtitle">
                                {subtitle}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        className="hms-drawer-close"
                        aria-label="Close"
                        onClick={onClose}
                    >
                        <X size={18} strokeWidth={2} />
                    </button>
                </div>
                <div className="hms-drawer-body">{children}</div>
                {footer && <div className="hms-drawer-footer">{footer}</div>}
            </aside>
        </>,
        host
    );
}
