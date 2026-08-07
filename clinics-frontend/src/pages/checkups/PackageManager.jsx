import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { checkupApi } from "@/utils/api";
import SearchableSelect from "@/components/ui/SearchableSelect";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import {
  Package, Plus, Edit2, Trash2, ToggleLeft, ToggleRight,
  ChevronDown, ChevronUp, GripVertical, X, Check, AlertCircle,
} from "lucide-react";

const CATEGORIES = [
  { value: "GENERAL", label: "General" },
  { value: "CARDIAC", label: "Cardiac" },
  { value: "DIABETIC", label: "Diabetic" },
  { value: "CANCER_SCREENING", label: "Cancer Screening" },
  { value: "WOMENS_HEALTH", label: "Women's Health" },
  { value: "SENIOR", label: "Senior" },
  { value: "PAEDIATRIC", label: "Paediatric" },
  { value: "COMPREHENSIVE", label: "Comprehensive" },
  { value: "CUSTOM", label: "Custom" },
];

const TEST_CATEGORIES = ["BLOOD_TEST", "RADIOLOGY", "CONSULTATION", "PHYSICAL", "VISION", "DENTAL", "GENERAL"];

const CATEGORY_CHIP_CLS = {
  GENERAL: "is-cat-general",
  CARDIAC: "is-cat-cardiac",
  DIABETIC: "is-cat-diabetic",
  CANCER_SCREENING: "is-cat-cancer",
  WOMENS_HEALTH: "is-cat-womens",
  SENIOR: "is-cat-senior",
  PAEDIATRIC: "is-cat-paediatric",
  COMPREHENSIVE: "is-cat-comprehensive",
  CUSTOM: "is-cat-custom",
};

const EMPTY_TEST = { testName: "", testCategory: "GENERAL", normalRange: "", mandatory: true };

const EMPTY_FORM = {
  name: "", description: "", category: "GENERAL", targetGender: "ANY",
  price: "", validityDays: 1, active: true, tests: [],
};

function PackageFormModal({ initial, hospitalId, onClose, onSaved }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addTest = () => setForm(f => ({ ...f, tests: [...f.tests, { ...EMPTY_TEST }] }));

  const updateTest = (i, k, v) => setForm(f => {
    const tests = [...f.tests];
    tests[i] = { ...tests[i], [k]: v };
    return { ...f, tests };
  });

  const removeTest = (i) => setForm(f => ({ ...f, tests: f.tests.filter((_, idx) => idx !== i) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.price) { setError("Name and price are required."); return; }
    if (form.tests.length === 0) { setError("Add at least one test to the package."); return; }
    setSaving(true); setError(null);
    try {
      await checkupApi.savePackage(hospitalId, { ...form, price: parseFloat(form.price) });
      onSaved();
      onClose();
    } catch { setError("Failed to save package. Please try again."); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="lg"
      title={form.id ? "Edit Package" : "New Health Package"}
      footer={
        <div className="flex items-center justify-between w-full">
          <label className="hms-pkg-modal__active-toggle" style={{ margin: 0 }}>
            <input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)} />
            <span>Active (visible for booking)</span>
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="zu-btn-cancel">Cancel</button>
            <button type="submit" form="package-form" disabled={saving} className="zu-btn-primary is-green">
              {saving ? "Saving…" : "Save Package"}
            </button>
          </div>
        </div>
      }
    >
      <form id="package-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && (
          <div className="hms-pkg-modal__error">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <div className="hms-pkg-modal__grid">
          <div className="is-span-2">
            <label className="hms-pkg-modal__label">Package Name</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Executive Health Package" className="hms-pkg-modal__input" />
          </div>
          <div>
            <label className="hms-pkg-modal__label">Category</label>
            <SearchableSelect value={form.category} onChange={v => set("category", v)}
              options={CATEGORIES.map(c => ({ value: c.value, label: c.label }))}
              clearable={false}
              searchable={false}
            />
          </div>
          <div>
            <label className="hms-pkg-modal__label">Target Gender</label>
            <SearchableSelect value={form.targetGender} onChange={v => set("targetGender", v)}
              options={[
                { value: "ANY", label: "Any / Unisex" },
                { value: "MALE", label: "Male Only" },
                { value: "FEMALE", label: "Female Only" },
              ]}
              clearable={false}
              searchable={false}
            />
          </div>
          <div>
            <label className="hms-pkg-modal__label">Price (₹)</label>
            <input type="number" step="0.01" value={form.price} onChange={e => set("price", e.target.value)} placeholder="0.00" className="hms-pkg-modal__input" />
          </div>
          <div>
            <label className="hms-pkg-modal__label">Validity (Days)</label>
            <input type="number" min="1" value={form.validityDays} onChange={e => set("validityDays", parseInt(e.target.value))} className="hms-pkg-modal__input" />
          </div>
          <div className="is-span-2">
            <label className="hms-pkg-modal__label">Description</label>
            <textarea rows={2} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Brief description of what this package covers…" className="hms-pkg-modal__input" />
          </div>
        </div>

        {/* Tests */}
        <div>
          <div className="hms-pkg-modal__test-head">
            <label className="hms-pkg-modal__label">Tests Included ({form.tests.length})</label>
            <button type="button" onClick={addTest} className="hms-pkg-modal__add-test">
              <Plus className="w-3 h-3" /> Add Test
            </button>
          </div>

          {form.tests.length === 0 ? (
            <div className="hms-pkg-modal__tests-empty">
              <Package className="w-6 h-6 opacity-40" />
              <p className="hms-pkg-modal__tests-empty-text">No tests added yet. Click "Add Test" to begin.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {form.tests.map((t, i) => (
                <div key={i} className="hms-pkg-modal__test-row">
                  <GripVertical className="hms-pkg-modal__test-grip w-4 h-4" />
                  <div className="hms-pkg-modal__test-fields">
                    <div>
                      <input value={t.testName} onChange={e => updateTest(i, "testName", e.target.value)} placeholder="Test name (e.g. Complete Blood Count)" className="hms-pkg-modal__test-field" />
                    </div>
                    <div>
                      <SearchableSelect value={t.testCategory} onChange={v => updateTest(i, "testCategory", v)}
                        options={TEST_CATEGORIES.map(c => ({ value: c, label: c.replace("_", " ") }))}
                        clearable={false}
                        searchable={false}
                      />
                    </div>
                  </div>
                  <div className="hms-pkg-modal__test-actions">
                    <label className="hms-pkg-modal__test-req">
                      <input type="checkbox" checked={t.mandatory} onChange={e => updateTest(i, "mandatory", e.target.checked)} />
                      Req.
                    </label>
                    <button type="button" onClick={() => removeTest(i)} className="hms-pkg-modal__test-remove">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}

function PackageCard({ pkg, onEdit, onToggle, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const label = CATEGORIES.find(c => c.value === pkg.category)?.label || pkg.category;
  const chipCls = CATEGORY_CHIP_CLS[pkg.category] || CATEGORY_CHIP_CLS.CUSTOM;

  return (
    <div className={`hms-checkup-pkg-tile ${pkg.active ? "" : "is-inactive"}`}>
      <div className="hms-checkup-pkg-tile__body">
        <div className="hms-checkup-pkg-tile__row">
          <div className="hms-checkup-pkg-tile__main">
            <div className="hms-checkup-pkg-tile__title-row">
              <h3 className="hms-checkup-pkg-tile__name">{pkg.name}</h3>
              <span className={`hms-checkup-pkg-tile__chip ${chipCls}`}>{label}</span>
              {pkg.targetGender !== "ANY" && (
                <span className="hms-checkup-pkg-tile__chip is-gender">{pkg.targetGender}</span>
              )}
              {!pkg.active && <span className="hms-checkup-pkg-tile__chip is-inactive">Inactive</span>}
            </div>
            {pkg.description && <p className="hms-checkup-pkg-tile__desc">{pkg.description}</p>}
          </div>
          <div className="hms-checkup-pkg-tile__price-col">
            <p className="hms-checkup-pkg-tile__price">₹{Number(pkg.price).toLocaleString("en-IN")}</p>
            <p className="hms-checkup-pkg-tile__validity">{pkg.validityDays === 1 ? "Single visit" : `${pkg.validityDays} days`}</p>
          </div>
        </div>

        <div className="hms-checkup-pkg-tile__foot">
          <button onClick={() => setExpanded(v => !v)} className="hms-checkup-pkg-tile__count">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {pkg.tests?.length || 0} tests
          </button>
          <div className="hms-checkup-pkg-tile__actions">
            <button onClick={onToggle} className={`hms-checkup-pkg-tile__act ${pkg.active ? 'is-on-toggle' : ''}`} title={pkg.active ? "Deactivate" : "Activate"}>
              {pkg.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            </button>
            <button onClick={onEdit} className="hms-checkup-pkg-tile__act is-edit">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="hms-checkup-pkg-tile__act is-delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {expanded && pkg.tests?.length > 0 && (
        <div className="hms-checkup-pkg-tile__tests">
          {pkg.tests.map((t, i) => (
            <div key={i} className="hms-checkup-pkg-tile__test-row">
              <span className="hms-checkup-pkg-tile__test-num">{i + 1}</span>
              <span className="hms-checkup-pkg-tile__test-name">{t.testName}</span>
              <span className="hms-checkup-pkg-tile__test-cat">{t.testCategory?.replace("_", " ")}</span>
              {t.normalRange && <span className="hms-checkup-pkg-tile__test-range">({t.normalRange})</span>}
              {t.mandatory && <Check className="w-3 h-3 text-emerald shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PackageManager() {
  const { user } = useAuth();
  const hospitalId = user?.hospitalId;

  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterCat, setFilterCat] = useState("ALL");

  useEffect(() => { if (hospitalId) load(); }, [hospitalId]);

  const load = async () => {
    setLoading(true);
    try { setPackages(await checkupApi.getPackages(hospitalId)); }
    finally { setLoading(false); }
  };

  const handleEdit = (pkg) => {
    setEditing({
      ...pkg,
      price: String(pkg.price),
      tests: (pkg.tests || []).map(t => ({ ...t })),
    });
    setShowForm(true);
  };

  const handleToggle = async (id) => {
    await checkupApi.togglePackage(id);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this package? Existing bookings will not be affected.")) return;
    await checkupApi.deletePackage(id);
    load();
  };

  const filtered = filterCat === "ALL" ? packages : packages.filter(p => p.category === filterCat);

  return (
    <div className="zu-page">
      <PageHeader
        title="Health Packages"
        subtitle="Define checkup packages your hospital offers"
        actions={
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="zu-btn-primary">
            <Plus className="w-4 h-4" /> New Package
          </button>
        }
      />

      <div className="zu-page-content">
      {/* Category filter */}
      <div className="hms-checkup-pkg-cat-row">
        <button onClick={() => setFilterCat("ALL")} className={`hms-checkup-pkg-cat-pill ${filterCat === "ALL" ? "is-on" : ""}`}>
          All ({packages.length})
        </button>
        {CATEGORIES.filter(c => packages.some(p => p.category === c.value)).map(c => (
          <button key={c.value} onClick={() => setFilterCat(c.value)} className={`hms-checkup-pkg-cat-pill ${filterCat === c.value ? "is-on" : ""}`}>
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="hms-checkup-pkg-list">
          {[1, 2, 3].map(i => <div key={i} className="hms-checkup-pkg-skel" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="hms-checkup-pkg-empty">
          <Package className="w-12 h-12 opacity-25" />
          <p className="hms-checkup-pkg-empty__title">No packages yet</p>
          <p className="hms-checkup-pkg-empty__sub">Create your first health checkup package to get started</p>
        </div>
      ) : (
        <div className="hms-checkup-pkg-list">
          {filtered.map(pkg => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              onEdit={() => handleEdit(pkg)}
              onToggle={() => handleToggle(pkg.id)}
              onDelete={() => handleDelete(pkg.id)}
            />
          ))}
        </div>
      )}
      </div>

      {showForm && (
        <PackageFormModal
          initial={editing}
          hospitalId={hospitalId}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
}
