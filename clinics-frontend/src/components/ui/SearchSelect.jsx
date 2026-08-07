import { Spinner } from "@/components/ui/Loader";
import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { useDebounce } from "../../utils/hooks";

function SearchSelect({
  label,
  value,
  onChange,
  onSearch,
  renderItem,
  getDisplayValue,
  placeholder = "Search...",
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    onSearch(debouncedQuery)
      .then((data) => { if (active) setResults(data); })
      .catch(() => { if (active) setResults([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [debouncedQuery, isOpen, onSearch]);

  const handleSelect = (item) => {
    onChange(item);
    setIsOpen(false);
    setQuery("");
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange(null);
    setQuery("");
  };

  return (
    <div className="hms-async-select" ref={containerRef}>
      <label className="label">{label}</label>
      <div
        className={`hms-async-select__field ${disabled ? "is-disabled" : ""}`}
        onClick={() => !disabled && setIsOpen(true)}
      >
        {!isOpen && value ? (
          <div className="hms-async-select__display">{getDisplayValue(value)}</div>
        ) : (
          <input
            type="text"
            className="hms-async-select__input"
            placeholder={value ? getDisplayValue(value) : placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            disabled={disabled}
          />
        )}
        <div className="hms-async-select__icons">
          {loading && isOpen && <Spinner className="w-4 h-4 zu-spinner" />}
          {value && !disabled && (
            <button type="button" className="hms-async-select__clear" onClick={handleClear}>
              <X className="w-4 h-4" />
            </button>
          )}
          {!value && !loading && <Search className="w-4 h-4" />}
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="hms-async-select__dropdown">
          {loading && results.length === 0 ? (
            <div className="hms-async-select__state">Searching...</div>
          ) : results.length === 0 ? (
            <div className="hms-async-select__state">No results found.</div>
          ) : (
            <ul className="hms-async-select__list">
              {results.map((item, idx) => (
                <li
                  key={idx}
                  className="hms-async-select__item"
                  onClick={() => handleSelect(item)}
                >
                  {renderItem(item)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export { SearchSelect as default };
