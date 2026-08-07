import { forwardRef } from "react";

/**
 * Native <textarea> styled with .hms-textarea. Forwards ref. For label
 * / hint / error wrap in <FormGroup>.
 *
 * Note — vertical resize is enabled in the CSS; pass `style={{resize:'none'}}`
 * if a specific call-site needs to lock it.
 */
const Textarea = forwardRef(function Textarea({ className = "", rows = 4, ...rest }, ref) {
    return (
        <textarea
            ref={ref}
            rows={rows}
            className={`hms-textarea ${className}`.trim()}
            {...rest}
        />
    );
});

export default Textarea;
