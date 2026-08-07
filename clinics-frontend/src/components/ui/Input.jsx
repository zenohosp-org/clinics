import { forwardRef } from "react";

/**
 * Native <input> styled with .hms-input. Forwards ref so RHF / focus
 * helpers / measurement utilities can attach. All native props pass
 * through.
 *
 * For label/hint/error, wrap in <FormGroup>.
 */
const Input = forwardRef(function Input({ className = "", type = "text", ...rest }, ref) {
    return (
        <input
            ref={ref}
            type={type}
            className={`hms-input ${className}`.trim()}
            {...rest}
        />
    );
});

export default Input;
