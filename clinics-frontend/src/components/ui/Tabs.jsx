/**
 * Tab strip — pill (segmented control) or underline (page nav).
 *
 * Controlled by the caller; this component renders the strip and the
 * panel for the currently active tab. If `panels` is omitted, only the
 * strip renders (useful when each tab is a separate route).
 *
 * Props
 *   tabs     Array<{ id: string, label: ReactNode, count?: number, disabled?: boolean }>
 *   active   string — id of the active tab
 *   onChange (id: string) => void
 *   type     "pill" | "underline"   default "underline"
 *   panels   optional { [id]: ReactNode } — content shown below the strip
 *   className extra classes appended to the wrapper
 */
export default function Tabs({ tabs = [], active, onChange, type = "underline", panels, className = "" }) {
    if (type === "pill") {
        return (
            <div className={className}>
                <div className="zu-pill-group" role="tablist">
                    {tabs.map((t) => {
                        const isActive = t.id === active;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                disabled={t.disabled}
                                className={`zu-pill-group__btn ${isActive ? "is-active" : ""}`}
                                onClick={() => !t.disabled && onChange?.(t.id)}
                            >
                                <span>{t.label}</span>
                                {typeof t.count === "number" && <span className="zu-pill-group__btn-count">{t.count}</span>}
                            </button>
                        );
                    })}
                </div>
                {panels && <div role="tabpanel">{panels[active]}</div>}
            </div>
        );
    }

    const stripClass = "hms-tabs-underline";

    return (
        <div className={className}>
            <div className={stripClass} role="tablist">
                {tabs.map((t) => {
                    const isActive = t.id === active;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            disabled={t.disabled}
                            className={`hms-tab-btn ${isActive ? "active" : ""}`}
                            onClick={() => !t.disabled && onChange?.(t.id)}
                        >
                            <span>{t.label}</span>
                            {typeof t.count === "number" && <span className="tab-count">{t.count}</span>}
                        </button>
                    );
                })}
            </div>
            {panels && <div role="tabpanel">{panels[active]}</div>}
        </div>
    );
}
