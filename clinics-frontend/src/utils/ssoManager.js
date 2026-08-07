const COOKIE_NAME = "sso_token";
const TOKEN_EXPIRY_KEY = "sso_token_expiry";
function getCookieDomain() {
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return "localhost";
  return "zenohosp.com";
}
function isSecure() {
  return window.location.protocol === "https:";
}
function decodeToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}
function setToken(token) {
  if (!token) return;
  const domain = getCookieDomain();
  const secure = isSecure();
  const maxAge = 86400;
  const domainAttr = domain !== "localhost" ? `; domain=${domain}` : "";
  const secureAttr = secure ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=${token}${domainAttr}; path=/; max-age=${maxAge}; SameSite=Lax${secureAttr}`;
  const decoded = decodeToken(token);
  if (decoded?.exp) {
    sessionStorage.setItem(TOKEN_EXPIRY_KEY, String(decoded.exp * 1e3));
  }
}
function getToken() {
  for (const cookie of document.cookie.split(";")) {
    const c = cookie.trim();
    if (c.startsWith(`${COOKIE_NAME}=`)) {
      return c.substring(`${COOKIE_NAME}=`.length) || null;
    }
  }
  return null;
}
function clearToken() {
  const domain = getCookieDomain();
  const domainAttr = domain !== "localhost" ? `; domain=${domain}` : "";
  const secureAttr = isSecure() ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=${domainAttr}; path=/; max-age=0; SameSite=Lax${secureAttr}`;
  sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
}
const SSOCookieManager = { setToken, getToken, clearToken, decodeToken };
var stdin_default = SSOCookieManager;
export {
  stdin_default as default
};
