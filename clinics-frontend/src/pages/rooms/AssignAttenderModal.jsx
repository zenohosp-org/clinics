import { useState } from "react";
import { admissionApi } from "@/utils/api";
import { Button, FormGroup, Input, Modal } from "@/components/ui";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { useNotification } from "@/context/NotificationContext";

/**
 * Assign / update the attender for a bed-level admission. Callers pass
 * the admissionId (each bed has its own) and a `label` that contextualises
 * the title bar (e.g. "Room 101" or "Bed 3 · Room 12"). Phase 9 migration —
 * data layer untouched (admissionApi.updateAttender), validators
 * preserved (admissionId required to submit).
 */
function AssignAttenderModal({ admissionId, label, existing, onClose, onSuccess }) {
    const { notify } = useNotification();
    const [submitting, setSubmitting] = useState(false);
    const [attender, setAttender] = useState({
        attenderName: existing?.name || "",
        attenderPhone: existing?.phone || "",
        attenderRelationship: existing?.relationship || "",
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!admissionId) {
            notify(
                "No active admission for this bed/room — attender cannot be assigned.",
                "error"
            );
            return;
        }
        try {
            setSubmitting(true);
            await admissionApi.updateAttender(admissionId, attender);
            onSuccess();
        } catch (error) {
            notify(error.response?.data?.message || "Failed to update attender", "error");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={
                <span>
                    Assign attender{" "}
                    <span className="hms-rooms-title-suffix">
                        · {label}
                    </span>
                </span>
            }
            size="md"
            footer={
                <>
                    <Button variant="cancel" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        type="submit"
                        form="attender-form"
                        loading={submitting}
                    >
                        Save attender
                    </Button>
                </>
            }
        >
            <form
                id="attender-form"
                onSubmit={handleSubmit}
                className="hms-rooms-form"
            >
                <FormGroup
                    label={
                        <>
                            Attender name <span className="hms-rooms-required">*</span>
                        </>
                    }
                >
                    <Input
                        required
                        placeholder="Full name of attender"
                        value={attender.attenderName}
                        onChange={(e) =>
                            setAttender({ ...attender, attenderName: e.target.value })
                        }
                    />
                </FormGroup>
                <div className="hms-rooms-form-grid-2">
                    <FormGroup label="Phone">
                        <Input
                            placeholder="Phone number"
                            value={attender.attenderPhone}
                            onChange={(e) =>
                                setAttender({ ...attender, attenderPhone: e.target.value })
                            }
                        />
                    </FormGroup>
                    <FormGroup label="Relationship">
                        <SearchableSelect
                            value={attender.attenderRelationship}
                            onChange={(v) =>
                                setAttender({ ...attender, attenderRelationship: v })
                            }
                            options={[
                                { value: "Spouse", label: "Spouse" },
                                { value: "Parent", label: "Parent" },
                                { value: "Child", label: "Child" },
                                { value: "Sibling", label: "Sibling" },
                                { value: "Friend", label: "Friend" },
                            ]}
                            placeholder="Select"
                        />
                    </FormGroup>
                </div>
            </form>
        </Modal>
    );
}

export { AssignAttenderModal as default };
