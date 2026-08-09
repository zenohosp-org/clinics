import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import api, { authApi, directoryLogout, isClinicsAccessDenied } from "@/utils/api";
import SSOCookieManager from "@/utils/ssoManager";
import { DEV_MOCK_AUTH } from "@/utils/devMockAuth";

const AuthContext = createContext(undefined);

const LOGOUT_FLAG_KEY = "hms_logout_in_progress";

// How often to validate the session while the tab is visible.
// Directory calls our backend logout directly — the HttpOnly sso_token cookie
// gets cleared server-side. The next /auth/me poll will return 401 and we log out.
const SESSION_POLL_MS = 30000;

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Ref so interval/event callbacks always see the current value without
  // needing to be re-registered every time user changes.
  const userRef = useRef(null);
  useEffect(() => { userRef.current = user; }, [user]);

  // ── Initial session load ────────────────────────────────────────────────
  useEffect(() => {
    const logoutInProgress = localStorage.getItem(LOGOUT_FLAG_KEY);
    if (logoutInProgress) {
      localStorage.removeItem(LOGOUT_FLAG_KEY);
      setIsLoading(false);
      return;
    }

    if (DEV_MOCK_AUTH) {
      const role = (import.meta.env.VITE_MOCK_USER_ROLE || 'hospital_admin').toLowerCase();
      setUser({
        id: import.meta.env.VITE_MOCK_USER_ID || '1',
        userId: import.meta.env.VITE_MOCK_USER_ID || '1',
        email: import.meta.env.VITE_MOCK_USER_EMAIL || 'dev@zenohosp.com',
        firstName: 'Dev',
        lastName: 'User',
        role,
        roleDisplay: role,
        hospitalId: import.meta.env.VITE_MOCK_HOSPITAL_ID || '1',
        hospitalName: 'Dev Hospital',
        isActive: true,
      });
      setIsLoading(false);
      return;
    }

    authApi.me()
      .then((profile) => setUser(mapProfileToUser(profile)))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  // ── Force-logout helper (session already dead on the server) ────────────
  // Does NOT call backend endpoints — they already cleared the session.
  const forceLogout = useCallback(() => {
    SSOCookieManager.clearToken(); // clean up any non-HttpOnly sso_token artifact
    setUser(null);
    userRef.current = null;
    window.location.href = "/login?logged_out=1";
  }, []);

  // ── 1. Poll /auth/me every 30 s while tab is visible ───────────────────
  // This is the PRIMARY cross-subdomain logout detector.
  //
  // Why: the sso_token cookie is HttpOnly — JS cannot read it via document.cookie,
  // so watching the cookie directly is impossible. When Directory (or any other
  // zenohosp.com app) calls our POST /api/auth/logout, the backend clears the
  // HttpOnly cookie. The next poll to /auth/me returns 401 and we log out.
  useEffect(() => {
    const id = setInterval(async () => {
      if (!userRef.current || document.visibilityState !== "visible") return;
      try {
        await authApi.me();
      } catch (err) {
        // Not a dead session — api.js already routed them to /unauthorized.
        if (isClinicsAccessDenied(err)) return;
        forceLogout();
      }
    }, SESSION_POLL_MS);
    return () => clearInterval(id);
  }, [forceLogout]);

  // ── 2. Revalidate immediately when tab becomes visible ──────────────────
  // Catches the case where logout happened while this tab was in the background.
  // visibilitychange is more reliable than window.focus across browsers.
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== "visible" || !userRef.current) return;
      try {
        await authApi.me();
      } catch (err) {
        if (isClinicsAccessDenied(err)) return;
        forceLogout();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [forceLogout]);

  // ── 3. Same-origin multi-tab broadcast (localStorage storage event) ─────
  // localStorage events fire only across tabs of the SAME origin, so this
  // handles multiple HMS tabs — not cross-subdomain. Kept as a fast path.
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === "sso-logout") forceLogout();
    };
    const handleCustomEvent = () => forceLogout();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("sso-logout", handleCustomEvent);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("sso-logout", handleCustomEvent);
    };
  }, [forceLogout]);

  // ── Refresh user from server ────────────────────────────────────────────
  // Used by SsoCallback so the user state is properly set before navigating
  // to a protected route. Calling authApi.me() directly in SsoCallback would
  // bypass setUser, leaving ProtectedRoute with user=null even on success.
  const refreshUser = useCallback(async () => {
    try {
      const profile = await authApi.me();
      const mapped = mapProfileToUser(profile);
      setUser(mapped);
      userRef.current = mapped;
      return true;
    } catch {
      return false;
    }
  }, []);

  // ── login ───────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    setIsLoading(true);
    try {
      const response = await authApi.login(email, password);
      setUser(mapProfileToUser(response));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── logout ──────────────────────────────────────────────────────────────
  // Clears HMS session + tells Directory to clear its own session.
  // Other zenohosp.com apps detect the HMS logout on their next /auth/me poll
  // (or immediately on visibilitychange), same as we detect theirs.
  const logout = useCallback(async () => {
    localStorage.setItem(LOGOUT_FLAG_KEY, "1");
    SSOCookieManager.clearToken();
    setUser(null);
    userRef.current = null;

    // Same-origin tab broadcast
    try {
      localStorage.setItem("sso-logout", String(Date.now()));
      window.dispatchEvent(new Event("sso-logout"));
    } catch (e) {
      console.warn("Same-origin logout broadcast failed:", e);
    }

    // Invalidate server sessions — don't await, let redirect happen immediately
    Promise.all([
      api.post("/auth/logout").catch(() => {}),
      directoryLogout().catch(() => {}),
    ]);

    window.location.href = "/login?logged_out=1";
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

function mapProfileToUser(profile) {
  const role = (profile.role ?? "").toLowerCase();
  return {
    id: profile.userId?.toString() ?? "",
    userId: profile.userId?.toString() ?? "",
    email: profile.email ?? "",
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? null,
    role,
    roleDisplay: profile.roleDisplay ?? role,
    hospitalId: profile.hospitalId?.toString() ?? null,
    hospitalName: profile.hospitalName ?? null,
    isActive: profile.isActive ?? true,
  };
}

export { AuthProvider, useAuth };
