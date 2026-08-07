import { Spinner } from "@/components/ui/Loader";

export default function GlobalLoader() {
    return (
        <div className="zu-loader is-global">
            <Spinner className="w-8 h-8" />
            <p className="zu-loader-text">Loading ZenoHosp...</p>
        </div>
    );
}
