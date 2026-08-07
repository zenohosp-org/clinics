import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { recordApi, consultationDraftsApi, vitalsApi } from "@/utils/api";
import {
  newBlankDrugItem,
  drugItemToRequest,
} from "@/components/prescription/PrescriptionDrugRow";

const AUTOSAVE_DELAY_MS = 1500;

/**
 * Encapsulates every piece of consultation state, persistence, and
 * autosave used by both:
 *   - ConsultationModal (single-patient pop-up flow)
 *   - ConsultationViewPage (queue-walked full-page flow)
 *
 * Why a hook and not a component: both surfaces need identical effects
 * (draft hydration, vitals fetch, debounced autosave) but render very
 * different shells. Hoisting state up keeps a single source of truth
 * for the data contract; the views are free to lay things out however
 * suits them.
 *
 * Reset behaviour: when `appointment.id` changes (Next Patient in the
 * page, or a fresh modal open), all form state resets to defaults and
 * the draft is re-fetched. No stale fields can leak between patients.
 *
 * Params:
 *   appointment — current AppointmentDto. Drives every effect's key.
 *   hospitalId  — used in the autosave upsert payload.
 *   notify      — toast emitter from NotificationContext.
 *   onSaved     — called with the created RecordDto after save lands.
 *
 * Returns a single object with form state, setters, vitals, autosave
 * status, and `saveConsultation()` handler. The caller wires it to UI.
 */
export function useConsultationDraft({ appointment, hospitalId, notify, onSaved }) {
  const [chiefComplaint, setChiefComplaint] = useState(appointment?.chiefComplaint || "");
  const [notes, setNotes] = useState("");
  const [instructions, setInstructions] = useState("");
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [items, setItems] = useState([newBlankDrugItem()]);
  const [saving, setSaving] = useState(false);

  const [hydrating, setHydrating] = useState(true);
  const [autosaveStatus, setAutosaveStatus] = useState("idle"); // idle | saving | saved | error
  const autosaveTimer = useRef(null);

  const [vitals, setVitals] = useState(null);
  // Tri-state so the consumer can distinguish "still fetching" from "no
  // row exists" (vitals===null and status==='loaded') from "request
  // failed". The strip / left panel render different copy for each.
  const [vitalsStatus, setVitalsStatus] = useState("idle"); // idle | loading | loaded | error

  const drugCount = useMemo(
    () => items.filter(i => i.drugName.trim().length > 0).length,
    [items],
  );

  // ── Reset + draft hydration on appointment change ─────────────────
  // Reset state to defaults FIRST so navigating from a patient with a
  // draft to one without doesn't leak fields. Then attempt to overlay
  // any existing draft.
  useEffect(() => {
    let cancelled = false;
    setChiefComplaint(appointment?.chiefComplaint || "");
    setNotes("");
    setInstructions("");
    setNextVisitDate("");
    setItems([newBlankDrugItem()]);
    setAutosaveStatus("idle");
    setVitals(null);
    setVitalsStatus("idle");

    if (!appointment?.id) {
      setHydrating(false);
      return () => { cancelled = true; };
    }

    setHydrating(true);
    consultationDraftsApi.get(appointment.id)
      .then((draft) => {
        if (cancelled || !draft?.payload) return;
        try {
          const p = JSON.parse(draft.payload);
          if (typeof p.chiefComplaint === "string") setChiefComplaint(p.chiefComplaint);
          if (typeof p.notes === "string")           setNotes(p.notes);
          if (typeof p.instructions === "string")    setInstructions(p.instructions);
          if (typeof p.nextVisitDate === "string")   setNextVisitDate(p.nextVisitDate);
          if (Array.isArray(p.items) && p.items.length > 0) {
            setItems(p.items.map((it, idx) => ({
              ...newBlankDrugItem(),
              ...it,
              // Drafts saved before the quantity auto-fill landed don't
              // carry quantityTouched. If they already have a quantity,
              // treat it as a manual override so the recompute effect
              // doesn't trample the value the doctor saw on close.
              quantityTouched: it.quantityTouched ?? (it.quantity != null && String(it.quantity) !== ""),
              key: Date.now() + idx + Math.random(),
            })));
          }
        } catch {
          /* corrupted draft — fall back to appointment defaults */
        }
      })
      .catch(() => { /* no draft / network — silent */ })
      .finally(() => { if (!cancelled) setHydrating(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment?.id]);

  // ── Vitals read ───────────────────────────────────────────────────
  // Independent from draft hydration so a slow /vitals call never
  // blocks the form becoming editable. 204 → no vitals yet.
  useEffect(() => {
    let cancelled = false;
    if (!appointment?.id) return;
    setVitalsStatus("loading");
    vitalsApi.get(appointment.id)
      .then((v) => {
        if (cancelled) return;
        setVitals(v);
        setVitalsStatus("loaded");
      })
      .catch(() => {
        if (!cancelled) setVitalsStatus("error");
      });
    return () => { cancelled = true; };
  }, [appointment?.id]);

  // ── Debounced autosave ────────────────────────────────────────────
  useEffect(() => {
    if (hydrating || !appointment?.id || !hospitalId) return;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      setAutosaveStatus("saving");
      try {
        const payload = JSON.stringify({
          chiefComplaint, notes, instructions, nextVisitDate,
          items: items.map(({ key, ...rest }) => rest),
        });
        await consultationDraftsApi.upsert(appointment.id, {
          hospitalId,
          patientId: appointment.patientId,
          payload,
        });
        setAutosaveStatus("saved");
      } catch {
        setAutosaveStatus("error");
      }
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(autosaveTimer.current);
  }, [
    chiefComplaint, notes, instructions, nextVisitDate, items,
    hydrating, appointment?.id, appointment?.patientId, hospitalId,
  ]);

  const setItemField = useCallback((key, field, value) => {
    setItems(prev => prev.map(i => i.key === key ? { ...i, [field]: value } : i));
  }, []);

  const removeItem = useCallback((key) => {
    setItems(prev => prev.length === 1
      ? [newBlankDrugItem()]
      : prev.filter(i => i.key !== key));
  }, []);

  const addItem = useCallback(() => {
    setItems(prev => [...prev, newBlankDrugItem()]);
  }, []);

  // Compose chief-complaint header into the narrative so the print
  // view can split on the leading "Chief complaint:" line without
  // touching the schema.
  const buildDescription = useCallback(() => {
    const parts = [];
    if (chiefComplaint.trim()) parts.push(`Chief complaint: ${chiefComplaint.trim()}`);
    if (notes.trim()) parts.push(notes.trim());
    return parts.length ? parts.join("\n\n") : undefined;
  }, [chiefComplaint, notes]);

  const saveConsultation = useCallback(async () => {
    if (!appointment?.patientId) {
      notify?.("Missing patient on appointment — cannot save", "error");
      return null;
    }

    const filledDrugs = items.filter(i => i.drugName.trim().length > 0);
    for (const it of filledDrugs) {
      const qty = Number(it.quantity);
      if (!qty || qty <= 0) {
        notify?.(`Set a positive quantity for ${it.drugName}`, "warning");
        return null;
      }
    }

    const hasAnyContent =
      chiefComplaint.trim() || notes.trim() || instructions.trim() ||
      filledDrugs.length > 0 || nextVisitDate;
    if (!hasAnyContent) {
      notify?.("Add notes, instructions, or a prescription before saving", "warning");
      return null;
    }

    setSaving(true);
    try {
      const payload = {
        hospitalId,
        patientId: appointment.patientId,
        // Pharmacy queries by PRESCRIPTION type — flip to that whenever the
        // doctor added drugs so dispense lists keep working.
        historyType: filledDrugs.length > 0 ? "PRESCRIPTION" : "CONSULTATION",
        description: buildDescription(),
        instructions: instructions.trim() || undefined,
        nextVisitDate: nextVisitDate || undefined,
        appointmentId: appointment.id,
        prescriptionItems: filledDrugs.length > 0
          ? filledDrugs.map((it, idx) => drugItemToRequest(it, idx))
          : undefined,
      };
      const created = await recordApi.create(payload);
      // Cancel any pending autosave so a late-firing PUT can't resurrect
      // the draft a moment after we delete it.
      clearTimeout(autosaveTimer.current);
      try { await consultationDraftsApi.remove(appointment.id); } catch { /* not fatal */ }
      notify?.(
        filledDrugs.length > 0
          ? `Consultation saved with ${filledDrugs.length} drug${filledDrugs.length === 1 ? "" : "s"}`
          : "Consultation saved",
        "success",
      );
      onSaved?.(created);
      return created;
    } catch (err) {
      notify?.(err?.response?.data?.message || "Failed to save consultation", "error");
      return null;
    } finally {
      setSaving(false);
    }
  }, [
    appointment?.id, appointment?.patientId, items, chiefComplaint, notes,
    instructions, nextVisitDate, hospitalId, buildDescription, notify, onSaved,
  ]);

  return {
    // form state
    chiefComplaint, setChiefComplaint,
    notes, setNotes,
    instructions, setInstructions,
    nextVisitDate, setNextVisitDate,
    items, setItemField, addItem, removeItem,
    drugCount,
    // sidecar
    vitals, setVitals, vitalsStatus,
    // bookkeeping
    hydrating, autosaveStatus, saving,
    // action
    saveConsultation,
  };
}
