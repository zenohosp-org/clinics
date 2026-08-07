import { useState, useEffect } from "react";
import { useNotification } from "@/context/NotificationContext";
import { patientServicesApi } from "@/utils/api";
import {
    Button,
    Drawer,
    FormGroup,
    Input,
    Modal,
} from "@/components/ui";
import SearchableSelect from "@/components/ui/SearchableSelect";

const MEAL_DEFAULTS = { BREAKFAST: "08:00", LUNCH: "13:00", DINNER: "20:00" };

const EMPTY_FORM = {
    name: "",
    type: "FOOD",
    mealTime: "BREAKFAST",
    chargeTime: "08:00",
    pricePerMeal: "",
    pricePerDay: "",
    isActive: true,
    oneTimeCharge: false,
};

/**
 * Patient service add / edit form. Edit mode opens as a right-edge
 * Drawer; create mode as a centred Modal. The shape of the request
 * payload (FOOD vs non-FOOD nullables, REGISTRATION oneTimeCharge
 * gating) is preserved byte-for-byte.
 */
function PatientServiceFormModal({ isOpen, onClose, service, hospitalId, onSuccess }) {
    const { notify } = useNotification();
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    useEffect(() => {
        if (service) {
            setForm({
                name: service.name,
                type: service.type,
                mealTime: service.mealTime || "BREAKFAST",
                chargeTime:
                    service.chargeTime ||
                    MEAL_DEFAULTS[service.mealTime] ||
                    "08:00",
                pricePerMeal: service.pricePerMeal ?? "",
                pricePerDay: service.pricePerDay ?? "",
                isActive: service.isActive,
                oneTimeCharge: service.oneTimeCharge ?? false,
            });
        } else {
            setForm(EMPTY_FORM);
        }
    }, [service, isOpen]);

    const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        const payload = {
            hospitalId,
            name: form.name.trim(),
            type: form.type,
            mealTime: form.type === "FOOD" ? form.mealTime : null,
            chargeTime: form.type === "FOOD" ? form.chargeTime : null,
            pricePerMeal:
                form.type === "FOOD" ? parseFloat(form.pricePerMeal) || 0 : null,
            pricePerDay:
                form.type !== "FOOD" ? parseFloat(form.pricePerDay) || 0 : null,
            isActive: form.isActive,
            oneTimeCharge: form.type === "REGISTRATION" ? form.oneTimeCharge : false,
        };
        setLoading(true);
        try {
            if (service) {
                await patientServicesApi.update(service.id, payload);
                notify("Service updated", "success");
            } else {
                await patientServicesApi.create(payload);
                notify("Service added", "success");
            }
            onSuccess();
            onClose();
        } catch {
            notify(
                service ? "Failed to update service" : "Failed to add service",
                "error"
            );
        } finally {
            setLoading(false);
        }
    };

    const formId = "patient-service-form";
    const required = <span className="text-danger">*</span>;

    const formBody = (
        <form
            id={formId}
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
        >
            <FormGroup label={<>Service name {required}</>}>
                <Input
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. Breakfast meal"
                    required
                />
            </FormGroup>

            <FormGroup label={<>Service type {required}</>}>
                <SearchableSelect
                    value={form.type}
                    onChange={(v) => set("type", v)}
                    options={[
                        { value: "FOOD", label: "Food" },
                        { value: "ROOM_SERVICE", label: "Room Service" },
                        { value: "CONVENIENCE", label: "Convenience" },
                        { value: "CUSTOM", label: "Custom" },
                        { value: "REGISTRATION", label: "Registration" },
                    ]}
                />
            </FormGroup>

            {form.type === "FOOD" && (
                <>
                    <div className="grid grid-cols-2 gap-4">
                        <FormGroup label={<>Meal time {required}</>}>
                            <SearchableSelect
                                value={form.mealTime}
                                onChange={(v) => {
                                    set("mealTime", v);
                                    set("chargeTime", MEAL_DEFAULTS[v] || "08:00");
                                }}
                                options={[
                                    { value: "BREAKFAST", label: "Breakfast" },
                                    { value: "LUNCH", label: "Lunch" },
                                    { value: "DINNER", label: "Dinner" },
                                ]}
                            />
                        </FormGroup>
                        <FormGroup label={<>Charge time {required}</>}>
                            <Input
                                type="time"
                                value={form.chargeTime}
                                onChange={(e) => set("chargeTime", e.target.value)}
                                required
                            />
                        </FormGroup>
                    </div>
                    <FormGroup label={<>Price per meal (₹) {required}</>}>
                        <Input
                            type="number"
                            min="0"
                            step="1"
                            value={form.pricePerMeal}
                            onChange={(e) => set("pricePerMeal", e.target.value)}
                            placeholder="0"
                            required
                        />
                    </FormGroup>
                </>
            )}

            {form.type !== "FOOD" && (
                <FormGroup
                    label={
                        <>
                            {form.type === "REGISTRATION"
                                ? "One-time fee (₹)"
                                : "Price per day (₹)"}{" "}
                            {required}
                        </>
                    }
                >
                    <Input
                        type="number"
                        min="0"
                        step="1"
                        value={form.pricePerDay}
                        onChange={(e) => set("pricePerDay", e.target.value)}
                        placeholder="0"
                        required
                    />
                </FormGroup>
            )}

            {form.type === "REGISTRATION" && (
                <label className="hms-svc-info-card">
                    <input
                        type="checkbox"
                        checked={form.oneTimeCharge}
                        onChange={(e) => set("oneTimeCharge", e.target.checked)}
                        className="hms-svc-info-card__checkbox"
                    />
                    <div>
                        <p className="hms-svc-info-card__title">
                            Charge only once on registration
                        </p>
                        <p className="hms-svc-info-card__description">
                            When enabled, this fee is billed once per new patient — not per day
                            during admission.
                        </p>
                    </div>
                </label>
            )}

            <div className="hms-svc-active-row">
                <div>
                    <p className="hms-svc-active-row__title">Active</p>
                    <p className="hms-svc-active-row__description">
                        Add to patient invoices automatically
                    </p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={form.isActive}
                    onClick={() => set("isActive", !form.isActive)}
                    className={`hms-toggle ${form.isActive ? "is-on" : ""}`}
                >
                    <span className="hms-toggle__handle" />
                </button>
            </div>
        </form>
    );

    const actionRow = (
        <>
            <Button variant="cancel" onClick={onClose} type="button">
                Cancel
            </Button>
            <Button variant="primary" type="submit" form={formId} loading={loading}>
                {service ? "Save changes" : "Add service"}
            </Button>
        </>
    );

    if (service) {
        return (
            <Drawer
                isOpen={isOpen}
                onClose={onClose}
                title="Edit service"
                footer={actionRow}
            >
                {formBody}
            </Drawer>
        );
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="New patient service"
            size="md"
            footer={actionRow}
        >
            {formBody}
        </Modal>
    );
}

export default PatientServiceFormModal;
