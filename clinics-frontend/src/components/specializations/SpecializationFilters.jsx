import { useState } from "react";

function SpecializationFilters({ isOpen, onClose, onApply, initialFilters }) {
  const [date, setDate] = useState(initialFilters.date || "");

  if (!isOpen) return null;

  const handleFilter = () => {
    onApply({ date: date || null });
    onClose();
  };

  return (
    <div className="hms-filter-panel is-sm">
      <div className="hms-filter-panel__body">
        <div className="hms-filter-panel__section">
          <label className="hms-filter-panel__label">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="hms-filter-panel__date-input"
          />
        </div>
      </div>
      <div className="hms-filter-panel__foot is-end">
        <button onClick={onClose} className="btn-secondary">Close</button>
        <button onClick={handleFilter} className="btn-primary">Filter</button>
      </div>
    </div>
  );
}

export { SpecializationFilters as default };
