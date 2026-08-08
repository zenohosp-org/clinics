import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useFeatureFlag } from "@/context/FeatureFlagsContext";
import {
    Home,
    Users,
    Building2,
    ClipboardList,
    ReceiptText,
    Activity,
    Bed,
    BedDouble,
    Calendar,
    Stethoscope,
    BookOpen,
    FlaskConical,
    Syringe,
    FileText,
    ScanLine,
    NotebookPen,
    Wallet,
    Coins,
    Landmark,
    BarChart2,
    ChevronDown,
    UserSquare2,
    CalendarDays,
    Award,
    Ambulance,
    HeartPulse,
    Settings,
    ConciergeBell,
    Droplet,
    Percent,
    Trash2,
    Truck,
} from "lucide-react";

const DASHBOARD_LINK = { label: "Dashboard", to: "/dashboard", icon: Home };
const CLINICAL_LINKS = [
    { label: "Doctors", to: "/doctors", icon: Users },
    { label: "Patients", to: "/patients", icon: Building2 },
    { label: "Appointments", to: "/appointments", icon: Calendar },
];
const ADMIN_LINKS = [
    { label: "Specializations", to: "/specializations", icon: Stethoscope },
    { label: "Services", to: "/services", icon: ClipboardList },
];
const SETTINGS_LINKS = [
    { label: "General Settings", to: "/settings/general", icon: Settings },
    { label: "Infrastructure", to: "/settings/infrastructure", icon: Building2 },
    { label: "Patient Services", to: "/settings/patient-services", icon: ConciergeBell },
    { label: "GST Rates", to: "/settings/gst-rates", icon: Percent },
    { label: "Packages", to: "/checkups/packages", icon: ClipboardList },
];
const ROOMS_LINKS = [
    { label: "IPD Admission", to: "/admissions", icon: BedDouble },
    { label: "Rooms and Allocations", to: "/rooms/allocation", icon: Bed },
    { label: "Logs", to: "/rooms/logs", icon: ClipboardList },
];
const AMBULANCE_LINKS = [
    { label: "Book", to: "/ambulance/book", icon: Ambulance },
    { label: "Status", to: "/ambulance/status", icon: Activity },
];
const CHECKUP_LINK = { label: "Health Checkups", to: "/checkups/bookings", icon: HeartPulse };
const BLOOD_BANK_LINKS = [
    { label: "Stock & Issuance", to: "/blood-bank/stock", icon: Droplet },
    { label: "Donors", to: "/blood-bank/donors", icon: Users },
];
const BMW_LINKS = [
    { label: "Daily Log", to: "/biomedical-waste/log", icon: Trash2 },
    { label: "Handovers", to: "/biomedical-waste/handovers", icon: Truck },
];
const HR_LINKS = [
    { label: "Staff Directory", to: "/staffs/directory", icon: UserSquare2 },
    { label: "Departments", to: "/staffs/departments", icon: Building2 },
    { label: "Designations", to: "/staffs/designations", icon: Award },
];
const BILLING_LINKS = [
    { label: "OPD Billing", to: "/billing/opd", icon: ReceiptText },
    { label: "IPD Billing", to: "/billing/ipd", icon: ReceiptText },
    { label: "Ambulance Billing", to: "/billing/ambulance", icon: Ambulance },
];
// Labs and Finance run inside this app rather than as separate products —
// see the note where EXTERNAL_APPS used to be.
const LAB_LINKS = [
    { label: "Lab Queue", to: "/labs/queue", icon: FlaskConical },
    { label: "Sample Collection", to: "/labs/collection", icon: Syringe },
    { label: "Lab Reports", to: "/labs/reports", icon: FileText },
    { label: "Radiology", to: "/labs/radiology", icon: ScanLine },
];
const FINANCE_LINKS = [
    { label: "Bank Accounts", to: "/finance/bank-accounts", icon: Landmark },
    { label: "Day Book", to: "/finance/day-book", icon: NotebookPen, adminOnly: true },
    { label: "Expenses", to: "/finance/expenses", icon: Wallet, adminOnly: true },
    { label: "Receivables", to: "/finance/receivables", icon: Coins },
    { label: "GST Reports", to: "/finance/gst", icon: Percent, adminOnly: true },
];
// No EXTERNAL_APPS list here, unlike HMS.
//
// Clinics is a standalone product, not a console inside the multi-app ZenoHosp
// suite. A clinic running it has no OT theatre, no separate pharmacy or labs
// deployment to switch to, so an "Other Apps" footer would advertise products
// the user does not have and cannot open. Labs and finance capability lives
// inside this app instead — see the Labs and Finance sections above.

function Sidebar({ isOpen }) {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const ambulanceEnabled = useFeatureFlag("AMBULANCE");
    const checkupsEnabled = useFeatureFlag("HEALTH_CHECKUPS");
    const ipdEnabled = useFeatureFlag("IPD");
    const [hrOpen, setHrOpen] = useState(() => location.pathname.startsWith("/staffs"));
    const [roomsOpen, setRoomsOpen] = useState(
        () => location.pathname.startsWith("/rooms") || location.pathname.startsWith("/admissions")
    );
    const [ambOpen, setAmbOpen] = useState(() => location.pathname.startsWith("/ambulance"));
    const [bbOpen, setBbOpen] = useState(() => location.pathname.startsWith("/blood-bank"));
    const [bmwOpen, setBmwOpen] = useState(() => location.pathname.startsWith("/biomedical-waste"));
    const [settingsOpen, setSettingsOpen] = useState(
        () =>
            location.pathname.startsWith("/settings") ||
            location.pathname.startsWith("/checkups/packages") ||
            location.pathname.startsWith("/settings/patient-services")
    );
    const [billingOpen, setBillingOpen] = useState(() => location.pathname.startsWith("/billing"));
    const [labsOpen, setLabsOpen] = useState(() => location.pathname.startsWith("/labs"));
    const [financeOpen, setFinanceOpen] = useState(() => location.pathname.startsWith("/finance"));

    const filteredClinicalLinks = CLINICAL_LINKS.filter((link) => {
        if (user?.role === "hospital_admin" || user?.role === "super_admin") return true;
        const allowedLinks = ["Patients", "Appointments"];
        return allowedLinks.includes(link.label);
    });
    const filteredAdminLinks = ADMIN_LINKS.filter((link) => {
        if (user?.role === "hospital_admin" || user?.role === "super_admin") return true;
        const allowedLinks = ["Billing"];
        return allowedLinks.includes(link.label);
    });
    const isHrAdmin = user?.role === "hospital_admin" || user?.role === "super_admin";
    const isFinanceAdmin = isHrAdmin;
    const hrActive = location.pathname.startsWith("/staffs");
    const roomsActive =
        location.pathname.startsWith("/rooms") || location.pathname.startsWith("/admissions");
    const ambActive = location.pathname.startsWith("/ambulance");
    const bbActive = location.pathname.startsWith("/blood-bank");
    const bmwActive = location.pathname.startsWith("/biomedical-waste");
    const settingsActive =
        location.pathname.startsWith("/settings") ||
        location.pathname.startsWith("/checkups/packages") ||
        location.pathname.startsWith("/settings/patient-services");
    const billingActive = location.pathname.startsWith("/billing");
    const visibleBillingLinks = BILLING_LINKS.filter(
        (link) => ambulanceEnabled || link.to !== "/billing/ambulance"
    );
    const labsActive = location.pathname.startsWith("/labs");
    const financeActive = location.pathname.startsWith("/finance");
    // Mirror the route guards: a doctor/staff session shouldn't be shown links
    // that would only bounce them to /unauthorized.
    const visibleFinanceLinks = FINANCE_LINKS.filter(
        (link) => !link.adminOnly || isFinanceAdmin
    );

    const renderLink = (link, isSubmenu = false) => {
        const Icon = link.icon;
        const isActiveLink = location.pathname.startsWith(link.to);
        const tourId = link.label.toLowerCase().replace(/\s+/g, '-');
        
        if (isSubmenu) {
            return (
                <li key={link.to}>
                    <button
                        data-tour={tourId}
                        onClick={() => navigate(link.to)}
                        title={!isOpen ? link.label : undefined}
                        className={isActiveLink ? "active" : ""}
                    >
                        {link.label}
                    </button>
                </li>
            );
        }

        return (
            <div className="sidebar-nav-group" key={link.to}>
                <button
                    data-tour={tourId}
                    onClick={() => navigate(link.to)}
                    title={!isOpen ? link.label : undefined}
                    className={`sidebar-nav-item${!isOpen ? " is-icon-only" : ""}${isActiveLink ? " active" : ""}`}
                >
                    <div className="sidebar-nav-label">
                        <Icon className="sidebar-nav-icon" />
                        {isOpen && <span>{link.label}</span>}
                    </div>
                </button>
            </div>
        );
    };

    const renderAccordionSection = (links, label, AccIcon, open, setOpen, active) => {
        if (!isOpen) return links.map((link) => renderLink(link));
        const accordionId = label === "Settings" ? "tour-settings-accordion" : undefined;
        return (
            <div className="sidebar-nav-group" key={label}>
                <button
                    id={accordionId}
                    onClick={() => setOpen((o) => !o)}
                    className={`sidebar-nav-item has-submenu${active ? " active" : ""}`}
                >
                    <div className="sidebar-nav-label">
                        <AccIcon className="sidebar-nav-icon" />
                        <span>{label}</span>
                    </div>
                    <ChevronDown
                        size={15}
                        className={`sidebar-nav-chevron${open ? " is-open" : ""}`}
                    />
                </button>
                {open && (
                    <ul className="sidebar-submenu">
                        {links.map((link) => renderLink(link, true))}
                    </ul>
                )}
            </div>
        );
    };

    return (
        <aside className={`sidebar${isOpen ? "" : " is-collapsed"}`}>
            <div className="sidebar-logo">
                <div className="sidebar-logo-icon">
                    <Activity className="w-4 h-4" />
                </div>
                {isOpen && (
                    <div className="sidebar-brand">
                        <p className="sidebar-brand-name">ZenoHosp</p>
                        <p className="sidebar-brand-sub">{user?.hospitalName}</p>
                    </div>
                )}
            </div>

            <nav className="sidebar-nav-container">
                {renderLink(DASHBOARD_LINK)}


                {filteredClinicalLinks.map((link) => renderLink(link))}
                {ipdEnabled &&
                    renderAccordionSection(
                        ROOMS_LINKS,
                        "IPD Management",
                        BedDouble,
                        roomsOpen,
                        setRoomsOpen,
                        roomsActive
                    )}
                {ambulanceEnabled &&
                    renderAccordionSection(
                        AMBULANCE_LINKS,
                        "Ambulance",
                        Ambulance,
                        ambOpen,
                        setAmbOpen,
                        ambActive
                    )}
                {renderAccordionSection(
                    BLOOD_BANK_LINKS,
                    "Blood Bank",
                    Droplet,
                    bbOpen,
                    setBbOpen,
                    bbActive
                )}
                {renderAccordionSection(
                    BMW_LINKS,
                    "Biomedical Waste",
                    Trash2,
                    bmwOpen,
                    setBmwOpen,
                    bmwActive
                )}
                {checkupsEnabled && renderLink(CHECKUP_LINK)}
                {renderAccordionSection(
                    LAB_LINKS,
                    "Labs",
                    FlaskConical,
                    labsOpen,
                    setLabsOpen,
                    labsActive
                )}
                {renderAccordionSection(
                    visibleBillingLinks,
                    "Billing",
                    ReceiptText,
                    billingOpen,
                    setBillingOpen,
                    billingActive
                )}
                {renderAccordionSection(
                    visibleFinanceLinks,
                    "Finance",
                    BarChart2,
                    financeOpen,
                    setFinanceOpen,
                    financeActive
                )}
                {filteredAdminLinks.map((link) => renderLink(link))}
                {isHrAdmin &&
                    renderAccordionSection(
                        HR_LINKS,
                        "HR & Staff",
                        ClipboardList,
                        hrOpen,
                        setHrOpen,
                        hrActive
                    )}
                {isHrAdmin &&
                    renderAccordionSection(
                        SETTINGS_LINKS,
                        "Settings",
                        Settings,
                        settingsOpen,
                        setSettingsOpen,
                        settingsActive
                    )}
            </nav>
        </aside>
    );
}

export { Sidebar as default };
