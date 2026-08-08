import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

/**
 * Confirmation for a destructive action.
 *
 * Keeps its own `working` state so the confirm button disables for the whole
 * round-trip. The caller's onConfirm decides whether the modal closes: it stays
 * open on failure so the error toast is read next to what caused it, rather
 * than the row silently reappearing in the list.
 */
export default function ConfirmDeleteModal({
    title = "Are you sure?",
    message,
    confirmLabel = "Delete",
    onCancel,
    onConfirm,
}) {
    const [working, setWorking] = useState(false);

    const run = async () => {
        setWorking(true);
        try {
            await onConfirm();
        } finally {
            setWorking(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={working ? () => {} : onCancel}
            title={title}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onCancel} disabled={working}>
                        Cancel
                    </Button>
                    <Button variant="danger" onClick={run} disabled={working}>
                        {working ? "Deleting…" : confirmLabel}
                    </Button>
                </>
            }
        >
            <div className="clinic-confirm">
                <div className="clinic-confirm__icon">
                    <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="clinic-confirm__body">{message}</div>
            </div>
        </Modal>
    );
}
