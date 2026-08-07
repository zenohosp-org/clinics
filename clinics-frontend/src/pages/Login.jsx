import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
    Activity,
    BarChart2,
    Bed,
    Calendar,
    FileText,
    FlaskConical,
    HeartPulse,
    ReceiptText,
    Stethoscope,
    Users,
} from "lucide-react";
import { DEV_MOCK_AUTH } from "@/utils/devMockAuth";

const ERROR_MESSAGES = {
    session_validation_failed: "Session validation failed. Please sign in again.",
    sso_failed: "Wrong email or password. Please try again.",
    user_not_found: "Your account is not registered in Clinics. Contact your admin.",
    account_inactive: "Your account is inactive. Contact your admin.",
    no_hms_access: "Clinics access is not enabled for your account.",
    role_missing: "Your account has no role assigned. Contact your admin.",
    internal_server_error: "Something went wrong on our side. Please try again.",
};

// Auto-rotating feature carousel. Inline icons + CSS transitions only —
// no external images, no network round-trips, so the panel renders
// instantly. All icons here are already used elsewhere in the app and
// therefore travel in the existing bundle (zero size impact).
const SLIDES = [
    {
        title: "Your whole clinic on one screen",
        sub: "Who's waiting, who's been seen, what's still owed — live.",
        Hero: BarChart2,
        side: [Calendar, Users, Activity],
        tone: "is-blue",
    },
    {
        title: "Patient records that follow the patient",
        sub: "Vitals, prescriptions and history available across every visit.",
        Hero: Users,
        side: [FileText, Stethoscope, HeartPulse],
        tone: "is-violet",
    },
    {
        title: "Bills settled before they leave",
        sub: "Consultation, labs and pharmacy charges roll up automatically.",
        Hero: ReceiptText,
        side: [FileText, Calendar, Activity],
        tone: "is-amber",
    },
    {
        title: "Labs ordered and reported in place",
        sub: "Raise an investigation mid-consult; results land on the chart.",
        Hero: FlaskConical,
        side: [Bed, HeartPulse, Stethoscope],
        tone: "is-green",
    },
];

const SLIDE_INTERVAL_MS = 4500;

export default function Login() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [slide, setSlide] = useState(0);

    useEffect(() => {
        if (DEV_MOCK_AUTH) {
            navigate("/", { replace: true });
        }
    }, [navigate]);

    useEffect(() => {
        const id = setInterval(
            () => setSlide((s) => (s + 1) % SLIDES.length),
            SLIDE_INTERVAL_MS
        );
        return () => clearInterval(id);
    }, []);

    const loggedOut = searchParams.get("logged_out");
    const error = searchParams.get("error");
    const errorMessage = error
        ? ERROR_MESSAGES[error] ?? "Login failed. Please try again."
        : null;

    return (
        <div className="hms-login">
            {/* Left — Sign in */}
            <div className="hms-login__form-pane">
                <div className="hms-login__form-inner">
                    <div className="hms-login__brand">
                        <div className="hms-login__brand-icon">
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="hms-login__brand-title">ZenoHosp</h1>
                        </div>
                    </div>

                    <div className="hms-login__heading">
                        <h2>Sign in</h2>
                        <p>to access Clinic Management System</p>
                    </div>

                    {loggedOut && (
                        <div className="hms-login__alert is-info">
                            You have been signed out successfully.
                        </div>
                    )}
                    {errorMessage && (
                        <div className="hms-login__alert is-danger">{errorMessage}</div>
                    )}

                    <button
                        type="button"
                        onClick={() => {
                            window.location.href = "/oauth2/authorization/directory";
                        }}
                        className="hms-login__sso-btn"
                    >
                        <Activity className="w-5 h-5" />
                        Sign in with ZenoHosp Directory
                    </button>

                    <p className="hms-login__terms">
                        Don&apos;t have a ZenoHosp account?{" "}
                        <span className="hms-login__terms-link">Contact your admin</span>
                    </p>
                </div>
            </div>

            {/* Right — Auto-rotating feature panel */}
            <div className="hms-login__visual">
                <div className="hms-login__carousel">
                    {SLIDES.map((s, i) => {
                        const Hero = s.Hero;
                        return (
                            <div
                                key={i}
                                className={`hms-login__slide ${s.tone}${
                                    i === slide ? " is-active" : ""
                                }`}
                                aria-hidden={i !== slide}
                            >
                                <div className="hms-login__slide-stage">
                                    <div className="hms-login__slide-hero">
                                        <Hero size={56} strokeWidth={1.6} />
                                    </div>
                                    {s.side.map((Icon, idx) => (
                                        <div
                                            key={idx}
                                            className={`hms-login__slide-orb is-orb-${idx + 1}`}
                                        >
                                            <Icon size={18} strokeWidth={1.8} />
                                        </div>
                                    ))}
                                </div>
                                <div className="hms-login__slide-caption">
                                    <h3>{s.title}</h3>
                                    <p>{s.sub}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="hms-login__dots">
                    {SLIDES.map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => setSlide(i)}
                            className={`hms-login__dot${i === slide ? " is-active" : ""}`}
                            aria-label={`Slide ${i + 1}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
