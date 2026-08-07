import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Centred modal dialog.
 *
 * Behavioural contract
 *   * Renders nothing when isOpen is false (early-return — keeps
 *     unmounted state for forms inside).
 *   * Portals to #modal-root so stacking context is independent of
 *     the calling component. Falls back to document.body if the root
 *     div is absent (defensive — should never happen because we add
 *     <div id="modal-root"> in index.html).
 *   * Escape key closes; backdrop click closes; clicks inside the
 *     dialog do NOT bubble to the backdrop.
 *   * Locks <body> scroll while open and restores the previous value
 *     on unmount — composes cleanly with nested modals because we
 *     read/write the live property rather than caching across mounts.
 *
 * Props
 *   isOpen    boolean
 *   onClose   () => void — called on ESC, backdrop click, X button
 *   title     string | node — rendered in the header; if omitted the
 *             header is suppressed entirely (caller can render their
 *             own with .hms-modal-header).
 *   size      "sm" | "md" | "lg" | "xl"   default "md"
 *   footer    optional node rendered in the footer (action row); when
 *             omitted, no footer slot is rendered.
 *   showClose boolean — hide the X button when false (e.g. forced
 *             confirmation dialogs).
 *   className extra classes appended to the dialog wrapper
 *   children  dialog body content
 */
export default function Modal({
    isOpen,
    onClose,
    title,
    size = "md",
    footer,
    showClose = true,
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

    return createPortal(
        <div
            className="zu-modal-overlay"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose?.();
            }}
            role="presentation"
        >
            <div
                className={`zu-modal zu-modal-${size} ${className}`.trim()}
                role="dialog"
                aria-modal="true"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {title !== undefined && (
                    <div className="zu-modal-header">
                        <h3>{title}</h3>
                        {showClose && (
                            <button
                                type="button"
                                className="zu-modal-close"
                                aria-label="Close"
                                onClick={onClose}
                            >
                                <X size={18} strokeWidth={2} />
                            </button>
                        )}
                    </div>
                )}
                <div className="zu-modal-body">{children}</div>
                {footer && <div className="zu-modal-footer">{footer}</div>}
            </div>
        </div>,
        host
    );
}
