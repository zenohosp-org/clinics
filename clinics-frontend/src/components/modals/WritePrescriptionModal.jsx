import { Spinner } from "@/components/ui/Loader";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { recordApi, doctorsApi, marApi } from "@/utils/api";
import { Plus, Pill, CheckCircle2, AlertTriangle, StopCircle } from "lucide-react";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { FormGroup } from "@/components/ui";
import { fmtDateTime } from "@/utils/date";
import {
  PrescriptionDrugRow,
  newBlankDrugItem,
  drugItemToRequest,
} from "@/components/prescription/PrescriptionDrugRow";

// Roles that may stop an active order — mirrors @PreAuthorize on the
// /ipd/prescription-items/{id}/stop endpoint and IpdMarTab's CAN_STOP_ROLES.
const CAN_STOP_ROLES = new Set(["doctor", "hospital_admin", "super_admin"]);

/**
 * Modal for writing a PRESCRIPTION-type record with structured drug lines.
 * Props:
 *   patient — { id, firstName, lastName, uhid }
 *   appointmentId — optional, set when invoked from an appointment row
 *   admissionId / admissionNumber — optional, set when invoked from an IPD context
 *   onClose — close handler
 *   onSaved — called with the created RecordDto after successful save
 */
export default function WritePrescriptionModal({
  patient, appointmentId, admissionId, admissionNumber, allergies, onClose, onSaved,
}) {
  const { user } = useAuth();
  const { notify } = useNotification();

  const [notes, setNotes] = useState("");
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [items, setItems] = useState([newBlankDrugItem()]);
  const [saving, setSaving] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [attendingDoctorId, setAttendingDoctorId] = useState(null);
  const [activeOrders, setActiveOrders] = useState([]);
  const [stopOpenId, setStopOpenId] = useState(null);
  const [stopReason, setStopReason] = useState("");
  const [stoppingId, setStoppingId] = useState(null);

  const canStop = CAN_STOP_ROLES.has(user?.role);

  useEffect(() => {
    doctorsApi.list(user.hospitalId).then((list) => {
      setDoctors(list ?? []);
      if (user.role === "doctor") setAttendingDoctorId(user.id);
    }).catch(() => {});
  }, [user.hospitalId, user.id, user.role]);

  // Currently-running medication orders for this admission, so the
  // prescriber can see what's already active before adding new drugs and
  // catch unintentional duplicate/overlapping orders (e.g. re-prescribing
  // the same drug under a different frequency without stopping the old one).
  const fetchActiveOrders = useCallback(() => {
    if (!admissionId) return;
    marApi.list(admissionId).then((data) => {
      setActiveOrders((data ?? []).filter((o) => o.status === "ACTIVE"));
    }).catch(() => {});
  }, [admissionId]);

  useEffect(() => { fetchActiveOrders(); }, [fetchActiveOrders]);

  const handleStopOrder = async (orderId) => {
    if (!stopReason.trim()) {
      notify("Reason is required to stop an order", "warning");
      return;
    }
    setStoppingId(orderId);
    try {
      await marApi.stopOrder(orderId, stopReason.trim());
      notify("Order stopped", "success");
      setStopOpenId(null);
      setStopReason("");
      fetchActiveOrders();
    } catch (err) {
      notify(err?.response?.data?.message || "Failed to stop order", "error");
    } finally {
      setStoppingId(null);
    }
  };

  // Best-effort match against currently-active orders so a drug row can warn
  // "this is already running" — same loose substring approach as the
  // allergy check below.
  const findActiveDuplicate = (drugName, drugGeneric) => {
    const name = (drugName || "").trim().toLowerCase();
    const generic = (drugGeneric || "").trim().toLowerCase();
    if (!name) return null;
    return activeOrders.find((o) => {
      const oName = (o.drugName || "").toLowerCase();
      if (!oName) return false;
      return oName.includes(name) || name.includes(oName)
        || (generic && (oName.includes(generic) || generic.includes(oName)));
    }) || null;
  };

  const doctorOptions = doctors.map((d) => ({
    value: d.userId,
    label: `Dr. ${[d.firstName, d.lastName].filter(Boolean).join(" ")}${d.specialization ? ` · ${d.specialization}` : ""}`,
  }));

  const knownAllergies = Array.isArray(allergies) ? allergies : [];
  const drugMatchesAllergy = (drugName, drugGeneric) => {
    const name = (drugName || "").trim().toLowerCase();
    const generic = (drugGeneric || "").trim().toLowerCase();
    if (!name && !generic) return null;
    return knownAllergies.find((a) => {
      const allergen = a.allergen.toLowerCase();
      return (name && (name.includes(allergen) || allergen.includes(name)))
          || (generic && (generic.includes(allergen) || allergen.includes(generic)));
    }) || null;
  };

  const setItemField = (key, field, value) => {
    setItems(prev => prev.map(i => i.key === key ? { ...i, [field]: value } : i));
  };

  const removeItem = (key) => {
    setItems(prev => prev.length === 1
      ? [newBlankDrugItem()]
      : prev.filter(i => i.key !== key));
  };

  const addItem = () => setItems(prev => [...prev, newBlankDrugItem()]);

  const handleSave = async (e) => {
    e?.preventDefault?.();
    const filled = items.filter(i => i.drugName.trim().length > 0);
    if (filled.length === 0) {
      notify("Add at least one drug to the prescription", "warning");
      return;
    }
    for (const it of filled) {
      const qty = Number(it.quantity);
      if (!qty || qty <= 0) {
        notify(`Set a positive quantity for ${it.drugName}`, "warning");
        return;
      }
      const allergyMatch = drugMatchesAllergy(it.drugName, it.drugGeneric);
      if (allergyMatch && !it.allergyAck?.trim()) {
        notify(`Enter a reason for prescribing ${it.drugName} despite the recorded ${allergyMatch.allergen} allergy`, "warning");
        return;
      }
    }
    if (!attendingDoctorId) {
      notify("Select the prescribing doctor", "warning");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        hospitalId: user.hospitalId,
        patientId: patient.id,
        historyType: "PRESCRIPTION",
        description: notes || undefined,
        nextVisitDate: nextVisitDate || undefined,
        admissionId: admissionId || undefined,
        admissionNumber: admissionNumber || undefined,
        appointmentId: appointmentId || undefined,
        prescriptionItems: filled.map((it, idx) => drugItemToRequest(it, idx)),
        attendingDoctorId: attendingDoctorId || undefined,
      };
      const created = await recordApi.create(payload);
      notify(`Prescription saved — ${filled.length} drug${filled.length === 1 ? "" : "s"}`, "success");
      onSaved?.(created);
    } catch (err) {
      notify(err?.response?.data?.message || "Failed to save prescription", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="zu-modal-overlay">
      <div className="zu-modal is-xl">

        {/* Header */}
        <div className="zu-modal-header">
          <div className="zu-modal-header-row">
            <div className="hms-cmodal__title-block">
              <div className="hms-icon-tile is-success">
                <Pill className="w-5 h-5" />
              </div>
              <div>
                <h2 className="hms-cmodal__title">Write Prescription</h2>
                <p className="hms-cmodal__subtitle">
                  {patient ? `${patient.firstName} ${patient.lastName ?? ""} · ${patient.uhid ?? ""}` : ""}
                  {appointmentId && <span className="hms-badge is-info is-soft ml-2">OPD</span>}
                  {admissionId && <span className="hms-badge is-violet is-soft ml-2">IPD</span>}
                </p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="zu-modal-body">
          <div className="hms-form-stack">

            {knownAllergies.length > 0 && (
              <div className="hms-allergy-banner">
                <AlertTriangle size={13} className="hms-allergy-banner__icon" />
                <span className="hms-allergy-banner__label">Known allergies:</span>
                <div className="hms-allergy-chip-row">
                  {knownAllergies.map((a) => (
                    <span
                      key={a.id}
                      className={`hms-allergy-chip is-${(a.severity || "UNKNOWN").toLowerCase()} is-readonly`}
                    >
                      {a.allergen}
                      {a.reaction && <span className="hms-allergy-chip__reaction">· {a.reaction}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {admissionId && activeOrders.length > 0 && (
              <div className="hms-active-meds">
                <p className="hms-active-meds__label">
                  <Pill size={12} /> Active medications for this admission
                </p>
                <div className="hms-active-meds__list">
                  {activeOrders.map((o) => {
                    const signa = [o.dose, o.frequency, o.route].filter(Boolean).join(" · ");
                    const isOpen = stopOpenId === o.orderId;
                    return (
                      <div key={o.orderId} className="hms-active-med-row">
                        <div className="hms-active-med-row__info">
                          <span className="hms-active-med-row__name">
                            {[o.drugName, o.drugStrength, o.drugForm].filter(Boolean).join(" ")}
                          </span>
                          {signa && <span className="hms-active-med-row__signa">{signa}</span>}
                          {(o.prescribedBy || o.prescribedAt) && (
                            <span className="hms-active-med-row__meta">
                              {o.prescribedBy && `Dr. ${o.prescribedBy}`}
                              {o.prescribedBy && o.prescribedAt && " · "}
                              {o.prescribedAt && fmtDateTime(o.prescribedAt)}
                            </span>
                          )}
                        </div>
                        {canStop && (
                          isOpen ? (
                            <div className="hms-active-med-row__stop-form">
                              <input
                                type="text"
                                value={stopReason}
                                onChange={(e) => setStopReason(e.target.value)}
                                placeholder="Reason for stopping…"
                                className="hms-active-med-row__stop-input"
                                autoFocus
                              />
                              <button
                                type="button"
                                className="hms-active-med-row__stop-confirm"
                                disabled={stoppingId === o.orderId}
                                onClick={() => handleStopOrder(o.orderId)}
                                title="Confirm stop"
                              >
                                {stoppingId === o.orderId
                                  ? <Spinner className="w-3 h-3 zu-spinner" />
                                  : <StopCircle size={12} />}
                              </button>
                              <button
                                type="button"
                                className="hms-active-med-row__stop-cancel"
                                onClick={() => { setStopOpenId(null); setStopReason(""); }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="hms-active-med-row__stop-btn"
                              onClick={() => { setStopOpenId(o.orderId); setStopReason(""); }}
                            >
                              <StopCircle size={12} /> Stop
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <FormGroup label={<span>Prescribing doctor <span className="text-danger">*</span></span>}>
              <SearchableSelect
                value={attendingDoctorId}
                onChange={setAttendingDoctorId}
                options={doctorOptions}
                placeholder="Select doctor…"
                clearable={false}
              />
            </FormGroup>

            <div className="hms-clinical-section">
              <div className="hms-rx-table">

                {/* Column header */}
                <div className="hms-rx-table-head">
                  <div className="hms-rx-table-head__cell" />
                  <div className="hms-rx-table-head__cell">Drug</div>
                  <div className="hms-rx-table-head__cell">Dose</div>
                  <div className="hms-rx-table-head__cell">Freq</div>
                  <div className="hms-rx-table-head__cell">Days</div>
                  <div className="hms-rx-table-head__cell">Qty *</div>
                  <div className="hms-rx-table-head__cell">Route</div>
                  <div className="hms-rx-table-head__cell" />
                </div>

                {items.map((item, idx) => (
                  <PrescriptionDrugRow
                    key={item.key}
                    index={idx}
                    item={item}
                    allergyMatch={drugMatchesAllergy(item.drugName, item.drugGeneric)}
                    duplicateOrder={findActiveDuplicate(item.drugName, item.drugGeneric)}
                    onChange={(field, value) => setItemField(item.key, field, value)}
                    onRemove={() => removeItem(item.key)}
                    isLastRemovable={items.length > 1}
                  />
                ))}

                {/* Add drug row */}
                <div className="hms-rx-add-row">
                  <button
                    type="button"
                    onClick={addItem}
                    className="hms-rx-add-btn is-ghost"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add drug
                  </button>
                </div>
              </div>
            </div>

            {/* Narrative notes — kept alongside the structured drugs.
                Doctors use this for context that doesn't fit any per-drug field:
                "monitor BP after first dose", "patient allergic to sulpha", etc.
                Pharmacy reads it for safety context at dispense time. */}
            <div className="hms-clinical-section">
              <label className="hms-rx-notes-label">
                Doctor's notes
                <span className="hms-rx-notes-label__hint">— context, warnings, follow-up</span>
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Monitor BP after first dose. Avoid driving for 24 hours."
                className="hms-clinical-textarea mt-2"
              />
            </div>

            {!admissionId && (
              <div className="hms-form-grid is-2col">
                <div className="hms-clinical-section">
                  <label className="hms-rx-notes-label">Next visit</label>
                  <input
                    type="datetime-local"
                    value={nextVisitDate}
                    onChange={e => setNextVisitDate(e.target.value)}
                    className="hms-clinical-input mt-2"
                  />
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="zu-modal-footer">
          <button type="button" onClick={onClose} className="zu-btn-cancel">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="zu-btn-primary">
            {saving ? <Spinner className="w-4 h-4 zu-spinner" /> : <CheckCircle2 className="w-4 h-4" />}
            Save Prescription
          </button>
        </div>
      </div>
    </div>
  );
}
