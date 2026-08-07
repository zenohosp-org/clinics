import { useState, useEffect } from "react";
import { specializationApi } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import {
    Button,
    Drawer,
    FormGroup,
    Input,
    Modal,
    Textarea,
} from "@/components/ui";

/**
 * Add / Edit Specialization.
 *
 * UX contract preserved from the pre-migration file:
 *   * `initialData` truthy  → edit, opens a right-edge Drawer.
 *   * `initialData` falsey  → create, opens a centred Modal.
 * Both share the same form, the same submit handler, and surface
 * identical toast messages on success/failure.
 *
 * The form is rendered as a shared subtree so the two presentation
 * shells stay in sync at the single source of truth.
 */
function AddSpecializationModal({ isOpen, onClose, onSuccess, initialData }) {
    const { user } = useAuth();
    const { notify } = useNotification();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ name: "", description: "" });

    useEffect(() => {
        if (initialData) {
            setFormData({ name: initialData.name, description: initialData.description || "" });
        } else {
            setFormData({ name: "", description: "" });
        }
    }, [initialData, isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user?.hospitalId) return;
        setLoading(true);
        try {
            if (initialData) {
                await specializationApi.update(initialData.id, {
                    ...formData,
                    hospitalId: user.hospitalId,
                });
                notify("Specialization updated successfully", "success");
            } else {
                await specializationApi.create({
                    ...formData,
                    hospitalId: user.hospitalId,
                });
                notify("Specialization added successfully", "success");
            }
            onSuccess?.();
            onClose?.();
        } catch (err) {
            notify(err.response?.data?.message || "Failed to save specialization", "error");
        } finally {
            setLoading(false);
        }
    };

    const formId = "specialization-form";

    const formBody = (
        <form
            id={formId}
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
        >
            <FormGroup
                label={
                    <>
                        Specialization <span className="text-danger">*</span>
                    </>
                }
            >
                <Input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Cardiology"
                />
            </FormGroup>

            <FormGroup label="Description">
                <Textarea
                    rows={4}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Enter detailed description…"
                />
            </FormGroup>
        </form>
    );

    const actionRow = (
        <>
            <Button variant="cancel" onClick={onClose} type="button">
                Cancel
            </Button>
            <Button
                variant="primary"
                type="submit"
                form={formId}
                loading={loading}
            >
                {initialData ? "Update specialization" : "Add specialization"}
            </Button>
        </>
    );

    if (initialData) {
        return (
            <Drawer
                isOpen={isOpen}
                onClose={onClose}
                title="Edit specialization"
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
            title="Add new specialization"
            size="md"
            footer={actionRow}
        >
            {formBody}
        </Modal>
    );
}

export { AddSpecializationModal as default };
