import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [500, 1000, 2000]; // exponential backoff in ms

const ERROR_MESSAGES = {
    sso_failed: "SSO login failed. Please try again.",
    user_not_found: "Your account is not registered in Clinics. Contact your admin.",
    account_inactive: "Your Clinics account is inactive. Contact your admin.",
    no_hms_access:
        "Clinics access is not enabled for your account. Please contact your directory admin.",
    role_missing: "Your account has no role assigned. Contact your admin.",
    internal_server_error: "An internal error occurred. Please try again.",
};

function SsoCallback() {
    const { user, isLoading, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [error, setError] = useState(null);
    const retryTimerRef = useRef(null);

    useEffect(() => {
        const errorParam = searchParams.get("error");
        if (errorParam) {
            setError(ERROR_MESSAGES[errorParam] ?? "Login failed. Please try again.");
            setTimeout(() => navigate("/login", { replace: true }), 3000);
            return;
        }

        if (!isLoading && user) {
            navigate("/dashboard", { replace: true });
            return;
        }

        if (!isLoading && !user) {
            let cancelled = false;
            let attempt = 0;

            const tryValidate = async () => {
                const ok = await refreshUser();
                if (cancelled) return;
                if (ok) return;

                if (attempt < MAX_RETRIES) {
                    retryTimerRef.current = setTimeout(tryValidate, RETRY_DELAYS[attempt]);
                    attempt++;
                } else {
                    setError("Failed to validate your session. Please try signing in again.");
                    retryTimerRef.current = setTimeout(() => {
                        if (!cancelled)
                            navigate("/login?error=session_validation_failed", { replace: true });
                    }, 3000);
                }
            };

            tryValidate();

            return () => {
                cancelled = true;
                clearTimeout(retryTimerRef.current);
            };
        }
    }, [searchParams, isLoading, user, navigate, refreshUser]);

    if (error) {
        return (
            <div className="hms-sso">
                <div className="hms-sso__card">
                    <div className="hms-sso__error-icon">
                        <svg
                            className="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </div>
                    <p className="hms-sso__title is-danger">{error}</p>
                    <p className="hms-sso__desc">Redirecting to login...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="hms-sso">
            <div className="hms-sso__card">
                <div className="hms-sso__spinner" />
                <p className="hms-sso__title">Completing sign-in...</p>
                <p className="hms-sso__desc">Please wait while we set up your session.</p>
            </div>
        </div>
    );
}

export { SsoCallback as default };
