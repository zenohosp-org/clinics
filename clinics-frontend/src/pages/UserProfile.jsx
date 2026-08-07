import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/ui/PageHeader";
import { Mail, User, Shield, Briefcase, Hash, Building2 } from "lucide-react";
import "./UserProfile.css";

export default function UserProfile() {
    const { user } = useAuth();

    if (!user) return null;

    const initials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "U";
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "User";

    return (
        <div className="zu-profile-page">
            <PageHeader title="User Profile" subtitle="Manage your account details" />
            
            <div className="zu-profile-content">
                <div className="zu-profile-card">
                    <div className="zu-profile-header">
                        <div className="zu-profile-avatar">{initials}</div>
                        <div className="zu-profile-header-info">
                            <h2>{fullName}</h2>
                            <p className="zu-profile-role">{user.roleDisplay || user.role || "User"}</p>
                        </div>
                    </div>

                    <div className="zu-profile-details">
                        <div className="zu-profile-detail-item">
                            <Mail className="zu-profile-icon" />
                            <div>
                                <label>Email Address</label>
                                <span>{user.email || "—"}</span>
                            </div>
                        </div>

                        <div className="zu-profile-detail-item">
                            <User className="zu-profile-icon" />
                            <div>
                                <label>First Name</label>
                                <span>{user.firstName || "—"}</span>
                            </div>
                        </div>

                        <div className="zu-profile-detail-item">
                            <User className="zu-profile-icon" />
                            <div>
                                <label>Last Name</label>
                                <span>{user.lastName || "—"}</span>
                            </div>
                        </div>

                        <div className="zu-profile-detail-item">
                            <Shield className="zu-profile-icon" />
                            <div>
                                <label>Role</label>
                                <span className="zu-profile-role-badge">{user.roleDisplay || user.role || "—"}</span>
                            </div>
                        </div>

                        <div className="zu-profile-detail-item">
                            <Briefcase className="zu-profile-icon" />
                            <div>
                                <label>Designation</label>
                                <span>{user.designation || "—"}</span>
                            </div>
                        </div>

                        <div className="zu-profile-detail-item">
                            <Hash className="zu-profile-icon" />
                            <div>
                                <label>Employee Code</label>
                                <span>{user.employeeCode || "—"}</span>
                            </div>
                        </div>

                        <div className="zu-profile-detail-item">
                            <Building2 className="zu-profile-icon" />
                            <div>
                                <label>Hospital ID</label>
                                <span className="is-mono">{user.hospitalId || "—"}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
