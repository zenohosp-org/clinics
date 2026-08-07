import { useState, useEffect } from "react";
import { useNotification } from "@/context/NotificationContext";
import { gstRateApi } from "@/utils/api";
import {
    Button,
    Drawer,
    FormGroup,
    Input,
    Modal,
} from "@/components/ui";

const EMPTY_FORM = {
    name: "",
    ratePercent: "",
    cgstPercent: "",
    sgstPercent: "",
    igstPercent: "",
    cessPercent: "",
    isDefault: false,
};

/**
 * GST rate preset add / edit form. Edit mode opens as a right-edge
 * Drawer; create mode as a centred Modal.
 */
function GstRateFormModal({ isOpen, onClose, rate, hospitalId, onSuccess }) {
    const { notify } = useNotification();
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    useEffect(() => {
        if (rate) {
            setForm({
                name: rate.name,
                ratePercent: rate.ratePercent ?? "",
                cgstPercent: rate.cgstPercent ?? "",
                sgstPercent: rate.sgstPercent ?? "",
                igstPercent: rate.igstPercent ?? "",
                cessPercent: rate.cessPercent ?? "",
                isDefault: rate.isDefault ?? false,
            });
        } else {
            setForm(EMPTY_FORM);
        }
    }, [rate, isOpen]);

    const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        const payload = {
            hospitalId,
            name: form.name.trim(),
            ratePercent: parseFloat(form.ratePercent) || 0,
            cgstPercent: parseFloat(form.cgstPercent) || 0,
            sgstPercent: parseFloat(form.sgstPercent) || 0,
            igstPercent: parseFloat(form.igstPercent) || 0,
            cessPercent: parseFloat(form.cessPercent) || 0,
            isDefault: form.isDefault,
        };
        setLoading(true);
        try {
            if (rate) {
                await gstRateApi.update(rate.id, payload);
                notify("GST rate updated", "success");
            } else {
                await gstRateApi.create(payload);
                notify("GST rate added", "success");
            }
            onSuccess();
            onClose();
        } catch {
            notify(
                rate ? "Failed to update GST rate" : "Failed to add GST rate",
                "error"
            );
        } finally {
            setLoading(false);
        }
    };

    const formId = "gst-rate-form";
    const required = <span className="text-danger">*</span>;

    const formBody = (
        <form
            id={formId}
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
        >
            <FormGroup label={<>Name {required}</>}>
                <Input
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. GST 18%"
                    required
                />
            </FormGroup>

            <FormGroup label={<>Rate (%) {required}</>}>
                <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.ratePercent}
                    onChange={(e) => set("ratePercent", e.target.value)}
                    placeholder="0"
                    required
                />
            </FormGroup>

            <div className="grid grid-cols-2 gap-4">
                <FormGroup label="CGST (%)">
                    <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={form.cgstPercent}
                        onChange={(e) => set("cgstPercent", e.target.value)}
                        placeholder="0"
                    />
                </FormGroup>
                <FormGroup label="SGST (%)">
                    <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={form.sgstPercent}
                        onChange={(e) => set("sgstPercent", e.target.value)}
                        placeholder="0"
                    />
                </FormGroup>
                <FormGroup label="IGST (%)">
                    <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={form.igstPercent}
                        onChange={(e) => set("igstPercent", e.target.value)}
                        placeholder="0"
                    />
                </FormGroup>
                <FormGroup label="Cess (%)">
                    <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={form.cessPercent}
                        onChange={(e) => set("cessPercent", e.target.value)}
                        placeholder="0"
                    />
                </FormGroup>
            </div>

            <div className="hms-svc-active-row">
                <div>
                    <p className="hms-svc-active-row__title">Default rate</p>
                    <p className="hms-svc-active-row__description">
                        Pre-selected wherever GST is applied for this hospital
                    </p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={form.isDefault}
                    onClick={() => set("isDefault", !form.isDefault)}
                    className={`hms-toggle ${form.isDefault ? "is-on" : ""}`}
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
                {rate ? "Save changes" : "Add GST rate"}
            </Button>
        </>
    );

    if (rate) {
        return (
            <Drawer
                isOpen={isOpen}
                onClose={onClose}
                title="Edit GST rate"
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
            title="New GST rate"
            size="md"
            footer={actionRow}
        >
            {formBody}
        </Modal>
    );
}

export default GstRateFormModal;
