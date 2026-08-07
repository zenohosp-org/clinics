import { forwardRef } from "react";
import { Search, X } from "lucide-react";

/**
 * Single-line search field with an inline icon and optional clear button.
 *
 * Controlled — caller owns `value` and `onChange`. The optional `onClear`
 * callback fires when the user hits the X button; if not supplied it
 * falls back to onChange("").
 *
 * Props
 *   value       string
 *   onChange    (next: string) => void
 *   onClear     optional () => void
 *   placeholder default "Search…"
 *   className   extra classes appended to the wrapper
 *   ...rest     forwarded to the <input>
 */
const SearchBar = forwardRef(function SearchBar(
    { value = "", onChange, onClear, placeholder = "Search…", className = "", ...rest },
    ref
) {
    const handleClear = () => {
        if (onClear) onClear();
        else onChange?.("");
    };
    return (
        <div className={`zu-search ${className}`.trim()}>
            <Search size={16} className="zu-search-icon" />
            <input
                ref={ref}
                type="search"
                className="hms-input"
                value={value}
                onChange={(e) => onChange?.(e.target.value)}
                placeholder={placeholder}
                {...rest}
            />
            {value && (
                <button
                    type="button"
                    className="zu-search-clear"
                    onClick={handleClear}
                    aria-label="Clear search"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
});

export default SearchBar;
