import { forwardRef } from "react";

/**
 * HMS design-system card surface.
 *
 * Wraps children in a .hms-card. Optional `interactive` adds the hover-
 * lift treatment; optional `glass` switches to the translucent variant.
 *
 * Props
 *   as           tag name to render — default "div"
 *   interactive  boolean — hover-lift + cursor pointer
 *   glass        boolean — translucent backdrop-blur variant
 *   className    extra classes appended
 *   ...rest      forwarded
 */
const Card = forwardRef(function Card(
    { as: Tag = "div", interactive = false, glass = false, className = "", children, ...rest },
    ref
) {
    const classes = [
        "zu-card",
        interactive && "is-interactive",
        glass && "is-glass",
        className,
    ]
        .filter(Boolean)
        .join(" ");
    return (
        <Tag ref={ref} className={classes} {...rest}>
            {children}
        </Tag>
    );
});

export default Card;
