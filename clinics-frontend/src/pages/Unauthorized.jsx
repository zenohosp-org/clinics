import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

function Unauthorized() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const isUnregisteredStaff =
        user && ["DOCTOR", "STAFF"].includes(user.role) && !user.hospitalId;

    // Set by api.js when the backend answers 403 clinics_access_denied: the
    // session is valid, the account simply isn't entitled to Clinics. Handled
    // first because it is the common case for someone arriving from another
    // ZenoHosp app on the shared cookie, and it must NOT read as "signed out".
    const noClinicsAccess = searchParams.get("reason") === "no_clinics_access";

    if (noClinicsAccess) {
        return (
            <div className="hms-page-center">
                <div className="hms-page-center__card">
                    <div className="hms-page-center__emoji">{"\u{1FA7A}"}</div>
                    <h1 className="hms-page-center__title">Clinics isn&apos;t enabled for your account</h1>
                    <p className="hms-page-center__desc">
                        You&apos;re still signed in
                        {user?.email ? (
                            <> as <span className="font-medium text-gray-700">{user.email}</span></>
                        ) : null}
                        {" "}— this app just isn&apos;t part of your access yet.
                        <br /><br />
                        Ask your administrator to enable <strong>Clinics</strong> for you in
                        ZenoHosp Directory, under Users &amp; Roles → Manage Modules.
                    </p>
                    <div className="hms-page-center__actions">
                        <button
                            className="hms-page-center__action-secondary"
                            onClick={() => { window.location.href = "https://directory.zenohosp.com"; }}
                        >
                            Go to ZenoHosp Directory
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="hms-page-center">
            <div className="hms-page-center__card">
                <div className="hms-page-center__emoji">
                    {isUnregisteredStaff ? "\u{1F3E5}" : "\u{1F512}"}
                </div>
                <h1 className="hms-page-center__title">
                    {isUnregisteredStaff
                        ? "Account Not Registered for This Hospital"
                        : "Access Denied"}
                </h1>
                <p className="hms-page-center__desc">
                    {isUnregisteredStaff ? (
                        <>
                            Your account{" "}
                            <span className="font-medium text-gray-700">
                                ({user?.email})
                            </span>{" "}
                            has not been added to any hospital yet.
                            <br />
                            <br />
                            Please contact your <strong>Hospital Administrator</strong> to add
                            your account before you can access the system.
                        </>
                    ) : (
                        <>
                            You don't have permission to access this page.
                            {user && (
                                <>
                                    {" "}
                                    Logged in as{" "}
                                    <span className="font-medium text-gray-700">
                                        {user.email}
                                    </span>{" "}
                                    ({user.roleDisplay}).
                                </>
                            )}
                        </>
                    )}
                </p>
                <div className="hms-page-center__actions">
                    <button
                        className="hms-page-center__action-secondary"
                        onClick={() => navigate("/login")}
                    >
                        ← Back to Login
                    </button>
                    {user && (
                        <button
                            className="hms-page-center__action-link"
                            onClick={logout}
                        >
                            Sign Out
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export { Unauthorized as default };
