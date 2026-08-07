/**
 * Empty state card with optional icon, title, description and CTA slot.
 *
 * Props
 *   icon         ReactNode — rendered inside .hms-empty-state-icon
 *   title        string | node
 *   description  string | node
 *   action       ReactNode — typically a <Button>
 *   className    extra classes appended to the card
 */
export default function EmptyState({ icon, title, description, action, className = "" }) {
    return (
        <div className={`hms-empty-state-card ${className}`.trim()}>
            {icon && <div className="hms-empty-state-icon">{icon}</div>}
            {title && <h3 className="hms-empty-state-title">{title}</h3>}
            {description && <p className="hms-empty-state-description">{description}</p>}
            {action}
        </div>
    );
}
