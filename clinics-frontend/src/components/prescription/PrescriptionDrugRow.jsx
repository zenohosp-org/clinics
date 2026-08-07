import { Spinner } from "@/components/ui/Loader";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { drugsApi } from "@/utils/api";
import { Search, Trash2, AlertCircle, AlertTriangle } from "lucide-react";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { fmtDateMed } from "@/utils/date";
import "@/styles/modules/prescription-table.css";

// Standard schedule shorthand used in Indian clinical practice.
export const FREQUENCIES = [
  { value: "OD",   label: "OD — Once daily" },
  { value: "BD",   label: "BD — Twice daily" },
  { value: "TDS",  label: "TDS — Thrice daily" },
  { value: "QID",  label: "QID — Four times daily" },
  { value: "Q4H",  label: "Q4H — Every 4 hours" },
  { value: "Q6H",  label: "Q6H — Every 6 hours" },
  { value: "Q8H",  label: "Q8H — Every 8 hours" },
  { value: "HS",   label: "HS — At bedtime" },
  { value: "AC",   label: "AC — Before meals" },
  { value: "PC",   label: "PC — After meals" },
  { value: "SOS",  label: "SOS — As needed" },
  { value: "STAT", label: "STAT — Immediately, once" },
];

// Doses per 24h for auto-fill of dispense quantity.
export const DOSES_PER_DAY = {
  OD: 1, BD: 2, TDS: 3, QID: 4,
  Q4H: 6, Q6H: 4, Q8H: 3,
  HS: 1, AC: 3, PC: 3,
  STAT: 1,
};

export function computeQuantity({ frequency, durationDays }) {
  const perDay = DOSES_PER_DAY[frequency];
  if (!perDay) return null;
  if (frequency === "STAT") return 1;
  const days = Number(durationDays);
  if (!Number.isFinite(days) || days <= 0) return null;
  const q = perDay * days;
  return q > 0 ? q : null;
}

export const ROUTES = [
  { value: "ORAL",       label: "Oral" },
  { value: "IV",         label: "IV" },
  { value: "IM",         label: "IM" },
  { value: "SC",         label: "Subcutaneous" },
  { value: "TOPICAL",    label: "Topical" },
  { value: "INHALED",    label: "Inhaled" },
  { value: "OPHTHALMIC", label: "Eye" },
  { value: "OTIC",       label: "Ear" },
  { value: "NASAL",      label: "Nasal" },
  { value: "RECTAL",     label: "Rectal" },
];

export function newBlankDrugItem() {
  return {
    key: Date.now() + Math.random(),
    drugId: null, drugName: "", drugGeneric: "", drugStrength: "", drugForm: "",
    dose: "", frequency: "BD", durationDays: "", quantity: "", route: "ORAL",
    instructions: "",
    quantityTouched: false,
    allergyAck: "",
  };
}

export function drugItemToRequest(it, displayOrder) {
  if (!it.drugName?.trim()) return undefined;
  return {
    drugId: it.drugId || undefined,
    drugName: it.drugName.trim(),
    drugGeneric: it.drugGeneric || undefined,
    drugStrength: it.drugStrength || undefined,
    drugForm: it.drugForm || undefined,
    dose: it.dose || undefined,
    frequency: it.frequency || undefined,
    durationDays: it.durationDays ? Number(it.durationDays) : undefined,
    quantity: Number(it.quantity),
    route: it.route || undefined,
    instructions: it.instructions || undefined,
    displayOrder,
    allergyOverrideReason: it.allergyAck?.trim() || undefined,
  };
}

export function PrescriptionDrugRow({ index, item, allergyMatch, duplicateOrder, onChange, onRemove, isLastRemovable }) {
  const { user } = useAuth();
  const [query, setQuery] = useState(item.drugName);
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);
  const blurTimer = useRef(null);

  useEffect(() => { setQuery(item.drugName); }, [item.drugName]);

  // Auto-fill quantity from frequency × duration.
  useEffect(() => {
    if (item.quantityTouched) return;
    const computed = computeQuantity({ frequency: item.frequency, durationDays: item.durationDays });
    const next = computed != null ? String(computed) : "";
    if (next !== (item.quantity ?? "")) onChange("quantity", next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.frequency, item.durationDays, item.quantityTouched]);

  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const data = await drugsApi.search(user?.hospitalId, q.trim());
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [user?.hospitalId]);

  const onQueryChange = (val) => {
    setQuery(val);
    onChange("drugName", val);
    onChange("drugId", null);
    setOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 200);
  };

  const pickDrug = (d) => {
    onChange("drugId", d.id);
    onChange("drugName", d.brandName || d.genericName || "");
    onChange("drugGeneric", d.genericName || "");
    onChange("drugStrength", d.strength || "");
    onChange("drugForm", d.form || "");
    setQuery(d.brandName || d.genericName || "");
    setOpen(false);
  };

  const isAutoQty = !item.quantityTouched && !!item.quantity;

  return (
    <div className={`hms-rx-row${allergyMatch ? " is-allergy-match" : ""}${duplicateOrder ? " is-duplicate-match" : ""}`}>

      {/* ── Main fields row ── */}
      <div className="hms-rx-row__cells">

        {/* # */}
        <div className="hms-rx-row__num">{index + 1}</div>

        {/* Drug search */}
        <div className="hms-rx-row__drug">
          <div className="hms-rx-drug-search">
            <Search size={11} className="hms-rx-drug-icon" />
            <input
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              onFocus={() => { clearTimeout(blurTimer.current); setOpen(true); if (results.length === 0 && query) doSearch(query); }}
              onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
              placeholder="Drug name (e.g. Amoxicillin, Crocin)"
              className="hms-rx-drug-input"
            />
            {searching && <Spinner className="w-3 h-3" />}
          </div>

          {item.drugId && (() => {
            const detail = [item.drugGeneric, item.drugStrength, item.drugForm].filter(Boolean).join(" · ");
            return detail ? <p className="hms-rx-drug-linked">{detail}</p> : null;
          })()}
          {allergyMatch && (
            <div className="hms-rx-allergy-ack">
              <p className="hms-rx-drug-allergy-warn">
                <AlertTriangle size={9} /> Allergy: {allergyMatch.allergen}
                {allergyMatch.reaction ? ` — ${allergyMatch.reaction}` : ""}
              </p>
              <input
                type="text"
                value={item.allergyAck}
                onChange={(e) => onChange("allergyAck", e.target.value)}
                placeholder="Reason for prescribing despite this allergy…"
                className="hms-rx-allergy-ack-input"
              />
            </div>
          )}
          {duplicateOrder && (
            <p className="hms-rx-drug-duplicate-warn">
              <AlertTriangle size={9} /> Active order already exists
              {[duplicateOrder.dose, duplicateOrder.frequency].filter(Boolean).join(" · ") &&
                ` — ${[duplicateOrder.dose, duplicateOrder.frequency].filter(Boolean).join(" · ")}`}
              {duplicateOrder.prescribedAt && ` (since ${fmtDateMed(duplicateOrder.prescribedAt)})`}
            </p>
          )}
          {!item.drugId && query.trim().length >= 2 && (
            <p className="hms-rx-drug-warn">
              <AlertCircle size={9} /> Not in drug master
            </p>
          )}

          {open && results.length > 0 && (
            <div className="hms-rx-drug-results">
              {results.map((d, idx) => (
                <div key={d.id ?? `catalog-${d.brandName}`}>
                  {/* Catalog fallback rows (id=null) come after master rows —
                      label the boundary so doctors know these aren't stocked. */}
                  {d.id == null && (idx === 0 || results[idx - 1].id != null) && (
                    <p className="hms-rx-drug-result__sub" style={{ padding: "4px 10px", margin: 0, fontWeight: 600, opacity: 0.7 }}>
                      Medicine catalog — not in your pharmacy
                    </p>
                  )}
                <button
                  type="button"
                  onMouseDown={() => pickDrug(d)}
                  className="hms-rx-drug-result"
                >
                  <p className="hms-rx-drug-result__name">{d.brandName}</p>
                  <p className="hms-rx-drug-result__sub">
                    {[d.genericName, d.strength, d.form].filter(Boolean).join(" · ")}
                    {d.schedule && (
                      <span className="hms-rx-sched-badge">SCH-{d.schedule}</span>
                    )}
                    {d.habitForming && (
                      <span className="hms-rx-sched-badge" style={{ background: "#fef2f2", color: "#b91c1c" }}>
                        Habit-forming
                      </span>
                    )}
                    {d.inStock !== undefined && (
                      <span className={`hms-rx-stock ${d.inStock ? "is-in" : "is-out"}`}>
                        {d.inStock ? "In stock" : d.id == null ? "Not stocked" : "Out"}
                      </span>
                    )}
                  </p>
                </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dose */}
        <div className="hms-rx-row__cell">
          <input
            value={item.dose}
            onChange={e => onChange("dose", e.target.value)}
            placeholder="1 tab"
            className="hms-rx-cell-input"
          />
        </div>

        {/* Frequency */}
        <div className="hms-rx-row__cell">
          <SearchableSelect
            value={item.frequency}
            onChange={v => onChange("frequency", v)}
            options={FREQUENCIES}
            clearable={false}
            searchable={false}
            compact={true}
          />
        </div>

        {/* Duration */}
        <div className="hms-rx-row__cell">
          <input
            type="number" min="0"
            value={item.durationDays}
            onChange={e => onChange("durationDays", e.target.value)}
            placeholder="7"
            className="hms-rx-cell-input"
          />
        </div>

        {/* Quantity */}
        <div className="hms-rx-row__cell">
          <input
            type="number" min="1"
            value={item.quantity}
            onChange={e => {
              const v = e.target.value;
              onChange("quantity", v);
              onChange("quantityTouched", v !== "");
            }}
            placeholder="14"
            required
            title={isAutoQty ? "Auto-computed from frequency × days" : ""}
            className={`hms-rx-cell-input${isAutoQty ? " is-auto" : ""}`}
          />
        </div>

        {/* Route */}
        <div className="hms-rx-row__cell">
          <SearchableSelect
            value={item.route}
            onChange={v => onChange("route", v)}
            options={ROUTES}
            clearable={false}
            searchable={false}
            compact={true}
          />
        </div>

        {/* Delete */}
        <button
          type="button"
          onClick={onRemove}
          disabled={!isLastRemovable}
          title={isLastRemovable ? "Remove drug" : "At least one drug is required"}
          className="hms-rx-del-btn"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* ── Instructions sub-row ── */}
      <div className="hms-rx-row__instr">
        <input
          value={item.instructions}
          onChange={e => onChange("instructions", e.target.value)}
          placeholder="Instructions: after meals, with milk, taper over 5 days…"
          className="hms-rx-instr-input"
        />
      </div>

    </div>
  );
}
