import { Spinner } from "@/components/ui/Loader";
import { useMemo, useState } from "react";
import { useFeatureFlags } from "@/context/FeatureFlagsContext";
import { useNotification } from "@/context/NotificationContext";
import { Ambulance, ScanLine, HeartPulse, BedDouble, Settings as SettingsIcon,  } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";

const FEATURE_META = {
    AMBULANCE: {
        label: "Ambulance",
        description: "Show ambulance booking, status and billing in the sidebar.",
        icon: Ambulance,
    },
    RADIOLOGY: {
        label: "Radiology",
        description: "Show the imaging queue and radiology reports module.",
        icon: ScanLine,
    },
    HEALTH_CHECKUPS: {
        label: "Health checkups",
        description: "Show packaged health-checkup bookings in the sidebar.",
        icon: HeartPulse,
    },
    IPD: {
        label: "IPD management",
        description: "Show room allocation, room logs and IPD admissions.",
        icon: BedDouble,
    },
};

/** Design-system styled toggle switch — backed by .hms-toggle. */
function ToggleSwitch({ checked, onChange, disabled }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            className={`hms-toggle ${checked ? "is-on" : ""}`}
        >
            <span className="hms-toggle__handle" />
        </button>
    );
}

/**
 * General settings — per-hospital feature flags. Toggling a row hides
 * the corresponding module from the sidebar; data and API endpoints
 * remain available even when disabled.
 */
export default function GeneralSettings() {
    const { flags, supported, loading, setFlag } = useFeatureFlags();
    const { notify } = useNotification();
    const [savingKey, setSavingKey] = useState(null);

    const rows = useMemo(() => {
        return (supported.length ? supported : Object.keys(FEATURE_META)).map((key) => ({
            key,
            meta: FEATURE_META[key] ?? {
                label: key,
                description: "",
                icon: SettingsIcon,
            },
            enabled: flags[key] !== false,
        }));
    }, [supported, flags]);

    const handleToggle = async (key, next) => {
        setSavingKey(key);
        try {
            await setFlag(key, next);
            notify(
                `${FEATURE_META[key]?.label ?? key} ${next ? "enabled" : "disabled"}`,
                "success"
            );
        } catch {
            notify("Failed to update setting", "error");
        } finally {
            setSavingKey(null);
        }
    };

    return (
        <div className="zu-page">
            <PageHeader
                title="General settings"
                subtitle="Enable or disable modules across the hospital. Disabling a module only hides it from the sidebar — existing data and API endpoints remain available."
            />

            <div className="zu-page-content">
                <Card className="p-0 overflow-hidden">
                    {loading ? (
                        <div className="hms-loader-stack">
                            <Spinner size={32} className="zu-spinner text-gray-700" />
                            <p className="m-0 text-13 text-gray-500">Loading settings…</p>
                        </div>
                    ) : (
                        <ul className="hms-settings-list">
                            {rows.map(({ key, meta, enabled }) => {
                                const Icon = meta.icon;
                                const isSaving = savingKey === key;
                                return (
                                    <li key={key} className="hms-settings-list__item">
                                        <div className="hms-settings-list__main">
                                            <span className="hms-icon-tile is-md">
                                                <Icon size={20} />
                                            </span>
                                            <div className="hms-settings-list__body">
                                                <p className="hms-settings-list__title">
                                                    {meta.label}
                                                    <Badge tone={enabled ? "success" : "neutral"} soft>
                                                        {enabled ? "Enabled" : "Disabled"}
                                                    </Badge>
                                                </p>
                                                {meta.description && (
                                                    <p className="hms-settings-list__description">
                                                        {meta.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="hms-settings-list__actions">
                                            {isSaving && (
                                                <Spinner size={16} className="zu-spinner text-gray-400" />
                                            )}
                                            <ToggleSwitch
                                                checked={enabled}
                                                onChange={(next) => handleToggle(key, next)}
                                                disabled={isSaving}
                                            />
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Card>
            
                    </div>
        </div>
    );
}
