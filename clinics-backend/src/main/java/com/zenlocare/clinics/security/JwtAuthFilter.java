package com.zenlocare.clinics.security;

import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String CLINICS_MODULE = "clinics";

    /** Error code the frontend matches on to show "no access" instead of logging out. */
    public static final String CLINICS_ACCESS_DENIED = "clinics_access_denied";

    private final JwtUtil jwtUtil;
    private final UserRepository userRepository;

    @Value("${sso.cookie.name:sso_token}")
    private String cookieName;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        String token = extractToken(request);

        if (token != null && jwtUtil.isTokenValid(token)) {
            String email = jwtUtil.extractEmail(token);
            String role = jwtUtil.extractRole(token);
            log.debug("JWT Auth: Token valid for email: {}, role: {}", email, role);

            Optional<User> userOpt = userRepository.findByEmail(email);
            if (!hasClinicsModule(token)) {
                // Directory gates auth-code issuance on the clinics module, so a
                // user without it can never complete a fresh sign-in. But tokens
                // live 24h: revoking access in Directory would otherwise leave an
                // already-issued sso_token working here until it expired — and
                // the cookie is shared across every *.zenohosp.com app, so any
                // HMS user's token would be accepted. Re-check the claim on each
                // request so a revocation takes effect on the next call.
                //
                // Answer 403 with an explicit code rather than falling through to
                // an anonymous 401. The distinction matters: this token is
                // perfectly VALID, the user simply isn't entitled to Clinics.
                // Reported as 401, the frontend's session poll reads it as
                // "session died", force-logs-out and bounces to Directory — so a
                // correct authorization decision looked like a random logout to
                // an HMS user who merely opened clinics.zenohosp.com.
                log.warn("JWT Auth: User {} has no 'clinics' module entitlement; denying with 403.", email);
                SecurityContextHolder.clearContext();
                if (request.getRequestURI().startsWith("/api/")) {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType("application/json");
                    response.getWriter().write(
                            "{\"error\":\"" + CLINICS_ACCESS_DENIED + "\","
                                    + "\"message\":\"Clinics access is not enabled for your account.\"}");
                    return; // stop the chain — do not let this fall through as anonymous
                }
            } else if (userOpt.isPresent() && !Boolean.FALSE.equals(userOpt.get().getIsActive())) {
                User user = userOpt.get();
                // Keep the raw JWT in the credentials slot so downstream
                // services (LabsClient et al.) can forward the caller's
                // identity to peer services without re-extracting from
                // the request. Backward-compatible: nothing currently
                // reads credentials, so existing callers see no change.
                var auth = new UsernamePasswordAuthenticationToken(
                        user,
                        token,
                        List.of(new SimpleGrantedAuthority("ROLE_" + role)));
                auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(auth);
            } else if (userOpt.isEmpty()) {
                log.warn("JWT Auth: User {} not found in database.", email);
                SecurityContextHolder.clearContext();
            } else {
                // A previously-issued token for a since-deactivated user must not keep
                // working until natural expiry — deactivation has to take effect immediately.
                log.warn("JWT Auth: User {} is deactivated; rejecting token.", email);
                SecurityContextHolder.clearContext();
            }
        } else {
            // No valid sso_token cookie/header present.
            // The SecurityContextHolderFilter may have already loaded auth from HMS_SESSION.
            // Clear it so the JWT cookie is the single source of truth — without it,
            // the user must re-authenticate even if an HTTP session still exists.
            // Skip OAuth2/login paths to avoid disrupting the SSO handshake flow.
            String uri = request.getRequestURI();
            boolean isOAuth2Path = uri.startsWith("/oauth2/") || uri.startsWith("/login/") || uri.startsWith("/error");
            if (!isOAuth2Path) {
                SecurityContextHolder.clearContext();
                if (token != null) {
                    log.warn("JWT Auth: Token is invalid or expired for URI: {}", uri);
                }
            }
        }

        filterChain.doFilter(request, response);
    }

    /**
     * True when the token carries the {@code clinics} module entitlement.
     *
     * <p>Dev mock-auth tokens are minted locally and carry no modules claim; the
     * gate is therefore skipped when the modules claim is entirely absent, which
     * only happens for tokens Directory did not issue. Directory always stamps
     * the claim (possibly empty) on real tokens, and an empty list correctly
     * denies.
     */
    private boolean hasClinicsModule(String token) {
        List<String> modules = jwtUtil.extractModules(token);
        if (modules.isEmpty() && !jwtUtil.hasModulesClaim(token)) {
            return true; // locally-minted dev token — not a Directory entitlement decision
        }
        return modules.contains(CLINICS_MODULE);
    }

    /**
     * Cookie takes priority over Bearer header — matches Directory's JwtFilter behaviour.
     * Cookie is set by the HMS backend after successful login/SSO; Bearer is kept for
     * API clients (e.g. mobile, automated tools) that cannot use cookies.
     */
    private String extractToken(HttpServletRequest request) {
        // 1. HttpOnly cookie (priority — set by server after login/SSO)
        if (request.getCookies() != null) {
            Optional<String> cookieToken = Arrays.stream(request.getCookies())
                    .filter(c -> cookieName.equals(c.getName()))
                    .map(Cookie::getValue)
                    .findFirst();
            if (cookieToken.isPresent()) {
                return cookieToken.get();
            }
            // Target cookie not found — fall through to Bearer header
        }
        // 2. Authorization: Bearer <token> (fallback for API clients)
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }
}
