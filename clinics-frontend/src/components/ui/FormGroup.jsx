import { forwardRef, useId } from "react";

/**
 * Wraps a label + control + hint/error in a .hms-form-group column.
 * The label's htmlFor is wired to the child control via a generated id
 * so screen readers and click-to-focus behaviour are correct without
 * the caller having to invent ids by hand.
 *
 * Props
 *   label    string | node — rendered as <label class="hms-label">
 *   hint     string | node — small helper text below the control
 *   error    string | node — replaces hint when set; flagged red
 *   children A single React element representing the control. The
 *            generated id is injected as a prop so <Input>/<Select>/
 *            <Textarea> automatically pick it up.
 *   className extra classes appended to the wrapper
 */
const FormGroup = forwardRef(function FormGroup(
    { label, hint, error, className = "", children, ...rest },
    ref
) {
    const generatedId = useId();
    const control =
        children && children.props && !children.props.id
            ? { ...children, props: { ...children.props, id: generatedId } }
            : children;
    const controlId = (control && control.props && control.props.id) || generatedId;

    return (
        <div ref={ref} className={`hms-form-group ${className}`.trim()} {...rest}>
            {label && (
                <label className="hms-label" htmlFor={controlId}>
                    {label}
                </label>
            )}
            {control}
            {error ? (
                <span className="hms-form-error">{error}</span>
            ) : hint ? (
                <span className="hms-form-hint">{hint}</span>
            ) : null}
        </div>
    );
});

export default FormGroup;
