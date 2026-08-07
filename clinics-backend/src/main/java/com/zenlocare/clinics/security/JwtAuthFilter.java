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
            if (userOpt.isPresent() && !Boolean.FALSE.equals(userOpt.get().getIsActive())) {
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
