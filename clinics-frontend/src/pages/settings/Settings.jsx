import InfrastructureMapping from "@/pages/ipd/InfrastructureMapping";

/**
 * Settings → Infrastructure tab. Thin wrapper that just renders the
 * InfrastructureMapping page; the surrounding background colour comes
 * from the parent Layout's gray-50 wash.
 */
export default function Settings() {
    return (
        <div className="zu-page flex-1">
            <InfrastructureMapping />
        </div>
    );
}
