import { forwardRef } from "react";

/**
 * Native <select> styled with .hms-select. The chevron is drawn as a
 * CSS background-image (no extra DOM), so this stays a one-element
 * component.
 *
 * Children are <option>s. For label/hint/error wrap in <FormGroup>.
 */
const Select = forwardRef(function Select({ className = "", children, ...rest }, ref) {
    return (
        <select ref={ref} className={`hms-select ${className}`.trim()} {...rest}>
            {children}
        </select>
    );
});

export default Select;
