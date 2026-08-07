import { useEffect, useState } from "react";
import { X } from "lucide-react";

export default function SidePane({ isOpen, onClose, title, children, footer }) {
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRendered(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(raf);
    } else {
      setVisible(false);
      const t = setTimeout(() => setRendered(false), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!rendered) return null;

  return (
    <div
      className={`hms-side-pane ${visible ? "is-visible" : ""}`}
      onClick={onClose}
    >
      <div className="hms-side-pane__panel" onClick={(e) => e.stopPropagation()}>
        <div className="hms-side-pane__head">
          <h2 className="hms-side-pane__title">{title}</h2>
          <button onClick={onClose} className="hms-drawer-close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="hms-side-pane__body">{children}</div>
        {footer && <div className="hms-side-pane__foot">{footer}</div>}
      </div>
    </div>
  );
}
