import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  if (isLoading) return null;
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  const hmsRoles = ["hospital_admin", "doctor", "staff"];
  if (user.role === "super_admin") {
    return <Navigate to="/unauthorized" replace />;
  }
  if (hmsRoles.includes(user.role) && !user.hospitalId) {
    return <Navigate to="/unauthorized" replace />;
  }
  if (!hmsRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }
  return <>{children}</>;
}
export {
  ProtectedRoute as default
};
