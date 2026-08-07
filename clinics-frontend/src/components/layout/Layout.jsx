import { Suspense, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import ProductTour from "./ProductTour";
import { CenterLoader } from "@/components/ui/Loader";

function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const location = useLocation();
    const isDashboard = location.pathname === "/dashboard" || location.pathname === "/";

    return (
        <div className="zu-app-shell">
            <ProductTour />
            <div className="no-print">
                <Sidebar isOpen={sidebarOpen} />
            </div>
            <div className="zu-app-shell-main">
                <div className="no-print">
                    <Header onMenuClick={() => setSidebarOpen((p) => !p)} />
                </div>
                <main className={`zu-app-shell-content ${isDashboard ? "zu-dashboard" : ""}`.trim()}>
                    <Suspense fallback={<CenterLoader />}>
                        <Outlet />
                    </Suspense>
                </main>
            </div>
        </div>
    );
}

export { Layout as default };
