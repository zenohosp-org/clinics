import { useState } from "react";
import { X } from "lucide-react";
import SearchableSelect from "@/components/ui/SearchableSelect";

function ServiceFilters({ isOpen, onClose, onFilter, departments }) {
  const [tempFilters, setTempFilters] = useState({
    departments: [],
    amountRange: "",
    statuses: [],
  });

  const toggleDepartment = (name) => {
    setTempFilters((prev) => ({
      ...prev,
      departments: prev.departments.includes(name)
        ? prev.departments.filter((d) => d !== name)
        : [...prev.departments, name],
    }));
  };

  const toggleStatus = (status) => {
    setTempFilters((prev) => ({
      ...prev,
      statuses: prev.statuses.includes(status)
        ? prev.statuses.filter((s) => s !== status)
        : [...prev.statuses, status],
    }));
  };

  const resetDepartments = () => setTempFilters((prev) => ({ ...prev, departments: [] }));
  const resetStatuses = () => setTempFilters((prev) => ({ ...prev, statuses: [] }));

  const handleApply = () => {
    onFilter(tempFilters);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="hms-filter-panel">
      <div className="hms-filter-panel__body">

        {/* Department */}
        <div className="hms-filter-panel__section">
          <div className="hms-filter-panel__section-head">
            <h3 className="hms-filter-panel__label">Department</h3>
            <button onClick={resetDepartments} className="hms-filter-panel__reset">Reset</button>
          </div>
          <div className="hms-filter-panel__chips">
            {departments.map((dept) => (
              <button
                key={dept.id}
                onClick={() => toggleDepartment(dept.name)}
                className={`hms-filter-panel__chip ${tempFilters.departments.includes(dept.name) ? "is-on" : ""}`}
              >
                {tempFilters.departments.includes(dept.name) && <X className="w-3 h-3" />}
                {dept.name}
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div className="hms-filter-panel__section">
          <h3 className="hms-filter-panel__label">Amount</h3>
          <SearchableSelect
            value={tempFilters.amountRange}
            onChange={(v) => setTempFilters((prev) => ({ ...prev, amountRange: v }))}
            options={[
              { value: "", label: "Select Range" },
              { value: "0-100", label: "$0 - $100" },
              { value: "101-200", label: "$101 - $200" },
              { value: "201-500", label: "$201 - $500" },
              { value: "501+", label: "$500+" },
            ]}
          />
        </div>

        {/* Status */}
        <div className="hms-filter-panel__section">
          <div className="hms-filter-panel__section-head">
            <h3 className="hms-filter-panel__label">Status</h3>
            <button onClick={resetStatuses} className="hms-filter-panel__reset">Reset</button>
          </div>
          <div className="hms-filter-panel__chips">
            {["Active", "Inactive"].map((status) => (
              <button
                key={status}
                onClick={() => toggleStatus(status)}
                className={`hms-filter-panel__chip ${tempFilters.statuses.includes(status) ? "is-on" : ""}`}
              >
                {tempFilters.statuses.includes(status) && <X className="w-3 h-3" />}
                {status}
              </button>
            ))}
          </div>
        </div>

      </div>

      <div className="hms-filter-panel__foot">
        <button onClick={onClose} className="btn-secondary flex-1">Close</button>
        <button onClick={handleApply} className="btn-primary flex-1">Filter</button>
      </div>
    </div>
  );
}

export { ServiceFilters as default };
