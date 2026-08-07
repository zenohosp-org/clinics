import { Loader2 } from "lucide-react";

export function Spinner({ size = 16, className = "", ...props }) {
    return <Loader2 size={size} className={`zu-spinner ${className}`} {...props} />;
}

export function CenterLoader({ text = "Loading...", className = "", iconClassName = "w-6 h-6" }) {
    return (
        <div className={`zu-loader ${className}`}>
            <Spinner className={iconClassName} />
            {text && <p className="zu-loader-text">{text}</p>}
        </div>
    );
}
