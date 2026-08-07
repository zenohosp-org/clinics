import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

function Unauthorized() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const isUnregisteredStaff =
        user && ["DOCTOR", "STAFF"].includes(user.role) && !user.hospitalId;

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
