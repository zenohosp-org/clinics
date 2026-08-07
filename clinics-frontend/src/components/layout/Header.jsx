import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Menu, Bell, LogOut, HelpCircle } from "lucide-react";
import { startProductTour } from "./ProductTour";
import CheckInWidget from "./CheckInWidget";

function Header({ onMenuClick }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`;
    return (
        <header className="zu-topnav">
            {/* Sidebar toggle only when the layout actually has a sidebar to
                toggle. FocusLayout passes no onMenuClick so the burger
                disappears entirely on the consultation-view page. */}
            {onMenuClick && (
                <button
                    onClick={onMenuClick}
                    className="zu-topnav-burger"
                    aria-label="Toggle sidebar"
                >
                    <Menu className="w-5 h-5" />
                </button>
            )}
            <span className="zu-topnav-title">Clinic Management System</span>
            <div className="zu-topnav-right">
                <CheckInWidget />
                <button
                    className="zu-topnav-bell"
                    aria-label="Take a Tour"
                    title="Take a Tour"
                    onClick={() => startProductTour()}
                >
                    <HelpCircle className="w-4 h-4" />
                </button>
                <button id="tour-notification-bell" className="zu-topnav-bell" aria-label="Notifications">
                    <Bell className="w-4 h-4" />
                    <span className="zu-topnav-bell-dot" />
                </button>

                <div className="zu-topnav-divider" />

                <div className="zu-topnav-user">
                    <div 
                        className="zu-topnav-user-profile-link"
                        onClick={() => navigate('/profile')}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
                        title="View Profile"
                    >
                        <div className="zu-topnav-user-avatar">{initials}</div>
                        <div className="zu-topnav-user-text">
                            <span className="zu-topnav-user-name">
                                {user?.firstName} {user?.lastName}
                            </span>
                            <span className="zu-topnav-user-role">{user?.roleDisplay}</span>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        title="Logout"
                        className="zu-topnav-logout"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </header>
    );
}

export { Header as default };
