import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header";
import { CenterLoader } from "@/components/ui/Loader";

/**
 * Sidebar-less variant of Layout used by full-page focus flows
 * (currently the doctor's Consultation View). The topbar is preserved
 * so the hospital identity + user menu stay visible — the doctor never
 * loses orientation — but the left navigation is hidden so the queue-
 * walked workspace gets the full viewport width.
 *
 * Header is mounted without an onMenuClick so its burger icon hides
 * (see Header.jsx). The page itself decides what controls to surface
 * for switching back (typically an Exit button in its own footer bar).
 */
export default function FocusLayout() {
    return (
        <div className="zu-app-shell is-focus">
            <div className="no-print">
                <Header />
            </div>
            <main className="zu-app-shell-content is-focus">
                <Suspense fallback={<CenterLoader />}>
                    <Outlet />
                </Suspense>
            </main>
        </div>
    );
}
