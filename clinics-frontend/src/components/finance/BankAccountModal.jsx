import { useCallback, useState } from "react";
import { useNotification } from "@/context/NotificationContext";
import { bankApi } from "@/utils/api";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import FormGroup from "@/components/ui/FormGroup";
import Alert from "@/components/ui/Alert";

// CASH is a first-class type here, not a bank: it models the petty-cash drawer
// that a clinic actually takes payment into. Payment flows filter on these
// values (cash payments may only credit a CASH account), so the strings must
// match what those flows send.
const ACCOUNT_TYPES = [
    { value: "CASH", label: "Cash (drawer)" },
    { value: "CURRENT", label: "Current" },
    { value: "SAVINGS", label: "Savings" },
];

const BLANK = {
    accountName: "",
    accountNumber: "",
    accountType: "CASH",
    bankName: "",
    branch: "",
    ifscCode: "",
    openingBalance: "",
    isDefault: false,
};

/**
 * Create/edit a bank account.
 *
 * Opening balance is only editable at creation. Current balance is derived as
 * opening + net transaction movement, so changing it later would restate every
 * historical balance and break reconciliation against the finance day book —
 * the backend rejects it, and the field is disabled here to say so up front
 * rather than failing on save.
 */
export default function BankAccountModal({
    account,
    hospitalId,
    hasExistingAccounts,
    onClose,
    onSaved,
}) {
    const { notify } = useNotification();
    const isEdit = !!account;
    const [form, setForm] = useState(() =>
        account
            ? {
                accountName: account.accountName ?? "",
                accountNumber: account.accountNumber ?? "",
                accountType: account.accountType ?? "CASH",
                bankName: account.bankName ?? "",
                branch: account.branch ?? "",
                ifscCode: account.ifscCode ?? "",
                openingBalance: account.openingBalance ?? "",
                isDefault: !!account.isDefault,
            }
            : BLANK
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const set = (name) => (e) =>
        setForm((f) => ({
            ...f,
            [name]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
        }));

    const isCash = form.accountType === "CASH";

    const submit = useCallback(
        async (e) => {
            e.preventDefault();
            setError("");
            setSaving(true);
            try {
                const payload = {
                    ...form,
                    openingBalance:
                        form.openingBalance === "" ? 0 : Number(form.openingBalance),
                    // A cash drawer has no bank, branch or IFSC — send nulls rather
                    // than empty strings so the row doesn't carry meaningless "".
                    bankName: isCash ? null : form.bankName || null,
                    branch: isCash ? null : form.branch || null,
                    ifscCode: isCash ? null : form.ifscCode || null,
                };
                if (isEdit) {
                    await bankApi.update(hospitalId, account.id, payload);
                    notify(`Updated ${payload.accountName}`, "success");
                } else {
                    await bankApi.create(hospitalId, payload);
                    notify(`Added ${payload.accountName}`, "success");
                }
                onSaved?.();
            } catch (err) {
                // Duplicate number (409) and validation (400) both carry a usable
                // message from the backend — show it inline where the user is
                // working rather than only as a toast.
                setError(err?.response?.data?.message ?? "Could not save the account");
            } finally {
                setSaving(false);
            }
        },
        [form, isCash, isEdit, account, hospitalId, notify, onSaved]
    );

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={isEdit ? `Edit ${account.accountName}` : "Add bank account"}
            size="md"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button type="submit" form="bank-account-form" disabled={saving}>
                        {saving ? "Saving…" : isEdit ? "Save changes" : "Add account"}
                    </Button>
                </>
            }
        >
            <form id="bank-account-form" onSubmit={submit} className="clinic-bank-form">
                {error && <Alert tone="danger">{error}</Alert>}

                <FormGroup label="Account name *">
                    <Input
                        value={form.accountName}
                        onChange={set("accountName")}
                        placeholder={isCash ? "Front desk cash" : "e.g. HDFC Current"}
                        required
                        autoFocus
                    />
                </FormGroup>

                <div className="clinic-bank-form__row">
                    <FormGroup label="Type *">
                        <Select value={form.accountType} onChange={set("accountType")}>
                            {ACCOUNT_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </Select>
                    </FormGroup>

                    <FormGroup label={isCash ? "Reference *" : "Account number *"}>
                        <Input
                            value={form.accountNumber}
                            onChange={set("accountNumber")}
                            placeholder={isCash ? "e.g. DRAWER-1" : "Account number"}
                            required
                        />
                    </FormGroup>
                </div>

                {/* A cash drawer has no bank details — hide rather than disable, so
                    the form doesn't present fields that can never apply. */}
                {!isCash && (
                    <>
                        <div className="clinic-bank-form__row">
                            <FormGroup label="Bank name">
                                <Input value={form.bankName} onChange={set("bankName")} placeholder="e.g. HDFC Bank" />
                            </FormGroup>
                            <FormGroup label="Branch">
                                <Input value={form.branch} onChange={set("branch")} placeholder="e.g. Anna Nagar" />
                            </FormGroup>
                        </div>
                        <FormGroup label="IFSC code">
                            <Input
                                value={form.ifscCode}
                                onChange={set("ifscCode")}
                                placeholder="e.g. HDFC0001234"
                                style={{ textTransform: "uppercase" }}
                            />
                        </FormGroup>
                    </>
                )}

                <FormGroup
                    label="Opening balance"
                    hint={
                        isEdit
                            ? "Fixed after creation — the current balance is derived from it. Post an adjusting transaction to correct it."
                            : "Balance on the day this account starts being tracked."
                    }
                >
                    <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.openingBalance}
                        onChange={set("openingBalance")}
                        placeholder="0.00"
                        disabled={isEdit}
                    />
                </FormGroup>

                <label className="clinic-bank-form__check">
                    <input
                        type="checkbox"
                        checked={form.isDefault}
                        onChange={set("isDefault")}
                        // The first account is forced default server-side; showing it
                        // ticked and locked explains why rather than letting the user
                        // untick something that will come back as true.
                        disabled={!hasExistingAccounts && !isEdit}
                    />
                    <span>
                        Default account for collecting payments
                        {!hasExistingAccounts && !isEdit && " (the first account is always the default)"}
                    </span>
                </label>
            </form>
        </Modal>
    );
}
