import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { hospitalServiceApi, gstRateApi } from "@/utils/api";
import {
    Button,
    Drawer,
    FormGroup,
    Input,
    Modal,
} from "@/components/ui";
import SearchableSelect from "@/components/ui/SearchableSelect";

/**
 * Add / Edit Service.
 *
 * UX contract preserved from the pre-migration file:
 *   * `service` truthy  → edit, opens a right-edge Drawer.
 *   * `service` falsey  → create, opens a centred Modal.
 * Both shells share the same form id so a single submit pipeline is the
 * source of truth.
 *
 * <SearchableSelect> is kept on the legacy stack for now — replacing the
 * searchable combobox is a separate concern from the design-system
 * migration and will happen later. Lives inside an <FormGroup> so the
 * label and surrounding rhythm match the rest of the form.
 */
function AddServiceModal({ isOpen, onClose, service, departments, onSuccess }) {
    const { user } = useAuth();
    const { notify } = useNotification();
    const [loading, setLoading] = useState(false);
    const [gstRates, setGstRates] = useState([]);
    const [errors, setErrors] = useState({});
    const [formData, setFormData] = useState({
        name: "",
        departmentId: "",
        price: "",
        gstRate: "",
    });

    useEffect(() => {
        if (service) {
            setFormData({
                name: service.name,
                departmentId: service.departmentId,
                price: service.price.toString(),
                gstRate: service.gstRate != null ? service.gstRate.toString() : "",
            });
        } else {
            setFormData({ name: "", departmentId: "", price: "", gstRate: "" });
        }
        setErrors({});
    }, [service, isOpen]);

    useEffect(() => {
        if (!isOpen || !user?.hospitalId) return;
        gstRateApi
            .list(user.hospitalId, true)
            .then((data) => setGstRates(data || []))
            .catch(() => setGstRates([]));
    }, [isOpen, user?.hospitalId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user?.hospitalId) return;
        // Department is required but rendered via SearchableSelect, which has no
        // native validation — guard it here so we surface an inline error
        // instead of letting the empty value 500 at the NOT NULL column.
        if (!formData.departmentId) {
            setErrors((p) => ({ ...p, departmentId: "Department is required" }));
            return;
        }
        const payload = {
            ...formData,
            hospitalId: user.hospitalId,
            price: parseFloat(formData.price),
            gstRate: Number(formData.gstRate),
            isActive: service ? service.isActive : true,
        };
        setLoading(true);
        try {
            if (service) {
                await hospitalServiceApi.update(service.id, payload);
                notify("Service updated successfully", "success");
            } else {
                await hospitalServiceApi.create(payload);
                notify("Service created successfully", "success");
            }
            onSuccess?.();
            onClose?.();
        } catch (err) {
            const fallback = service ? "Failed to update service" : "Failed to create service";
            notify(err.response?.data?.message || fallback, "error");
        } finally {
            setLoading(false);
        }
    };

    const formId = "service-form";
    const required = <span className="text-danger">*</span>;

    const formBody = (
        <form
            id={formId}
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
        >
            <FormGroup label={<>Service name {required}</>}>
                <Input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. General consultation"
                />
            </FormGroup>

            <FormGroup label={<>Department {required}</>} error={errors.departmentId}>
                <SearchableSelect
                    value={formData.departmentId}
                    onChange={(v) => {
                        setFormData((p) => ({ ...p, departmentId: v }));
                        if (v) setErrors((p) => ({ ...p, departmentId: undefined }));
                    }}
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    placeholder="Select department"
                />
            </FormGroup>

            <FormGroup label={<>Price (₹) {required}</>}>
                <Input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
                    placeholder="0.00"
                />
            </FormGroup>

            <FormGroup label="GST rate (%)" hint="Choose the slab applied to this service">
                <SearchableSelect
                    value={formData.gstRate}
                    onChange={(v) => setFormData((p) => ({ ...p, gstRate: v }))}
                    options={gstRates.map((r) => ({
                        value: String(r.ratePercent),
                        label: r.name,
                    }))}
                    placeholder="Select GST rate"
                />
            </FormGroup>
        </form>
    );

    const actionRow = (
        <>
            <Button variant="cancel" onClick={onClose} type="button">
                Cancel
            </Button>
            <Button variant="primary" type="submit" form={formId} loading={loading}>
                {service ? "Update service" : "Add new service"}
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
            title="New service"
            size="md"
            footer={actionRow}
        >
            {formBody}
        </Modal>
    );
}

export { AddServiceModal as default };
