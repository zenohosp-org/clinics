import { useState, useEffect, useRef } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import api from "@/utils/api";

function StateSelect({ value, onChange, inputClassName, labelClassName, required }) {
  const [states, setStates] = useState([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    api.get("/states").then((res) => setStates(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = query
    ? states.filter(
        (s) =>
          s.stateName.toLowerCase().includes(query.toLowerCase()) ||
          s.stateCode.toLowerCase().includes(query.toLowerCase())
      )
    : states;

  const handleSelect = (stateName) => {
    onChange(stateName);
    setOpen(false);
    setQuery("");
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange("");
    setQuery("");
  };

  return (
    <div ref={containerRef} className="hms-state-select">
      <label className={labelClassName}>State {required && "*"}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputClassName} flex items-center justify-between text-left`}
      >
        <span className={value ? "" : "text-gray-400"}>{value || "Select state"}</span>
        <span className="hms-select__icons">
          {value && (
            <button type="button" className="hms-select__clear" onClick={handleClear}>
              <X className="w-3 h-3" />
            </button>
          )}
          <ChevronDown className={`hms-select__chevron w-4 h-4 ${open ? "is-open" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="hms-state-select__dropdown">
          <div className="hms-state-select__search-row">
            <Search className="w-4 h-4 shrink-0" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search state..."
              className="hms-state-select__search-input"
            />
          </div>
          <ul className="hms-state-select__list">
            {filtered.length === 0 && (
              <li className="hms-state-select__empty">No states found</li>
            )}
            {filtered.map((s) => (
              <li
                key={s.id}
                onClick={() => handleSelect(s.stateName)}
                className={`hms-state-select__option ${value === s.stateName ? "is-selected" : ""}`}
              >
                <span>{s.stateName}</span>
                <span className="hms-state-select__code">{s.stateCode}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export { StateSelect as default };
