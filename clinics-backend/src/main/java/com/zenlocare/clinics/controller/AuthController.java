package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.dto.AuthResponse;
import com.zenlocare.clinics.dto.LoginRequest;
import com.zenlocare.clinics.dto.RegisterRequest;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @Value("${sso.cookie.name:sso_token}")
    private String cookieName;

    @Value("${sso.cookie.domain:localhost}")
    private String cookieDomain;

    @Value("${sso.cookie.secure:false}")
    private boolean cookieSecure;

    @Value("${sso.cookie.max-age:86400}")
    private int cookieMaxAge;

    /**
     * POST /api/auth/login
     * Authenticates user, sets HttpOnly cookie, returns user profile.
     */
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody LoginRequest request,
                                               HttpServletResponse response) {
        AuthResponse authResponse = authService.login(request);
        if (authResponse.getToken() != null) {
            setJwtCookieHeader(response, authResponse.getToken());
        }
        return ResponseEntity.ok(authResponse);
    }

    /**
     * POST /api/auth/register
     * Registers a new user, sets HttpOnly cookie, returns user profile.
     */
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@RequestBody RegisterRequest request,
                                                  HttpServletResponse response) {
        AuthResponse authResponse = authService.register(request);
        if (authResponse.getToken() != null) {
            setJwtCookieHeader(response, authResponse.getToken());
        }
        return ResponseEntity.ok(authResponse);
    }

    /**
     * GET /api/auth/me
     * Returns profile of the currently authenticated user (resolved from cookie JWT).
     */
    @GetMapping("/me")
    public ResponseEntity<AuthResponse> getProfile(@AuthenticationPrincipal User user) {
        return ResponseEntity.ok(authService.getProfile(user));
    }

    /**
     * POST /api/auth/logout
     * Clears the JWT cookie. Must use the exact same cookie attributes as set-time.
     */
    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(HttpServletRequest request,
                                                      HttpServletResponse response) {
        // Invalidate the Spring Security HTTP session (HMS_SESSION cookie)
        HttpSession session = request.getSession(false);
        if (session != null) session.invalidate();

        clearJwtCookieHeader(response);
        return ResponseEntity.ok(Map.of("message", "Logged out successfully", "status", "success"));
    }

    /**
     * GET /api/auth/health
     */
    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("Auth service is running");
    }

    /**
     * Sets the JWT cookie using a raw Set-Cookie header.
     *
     * WHY raw header instead of Java Cookie API:
     * Java's Cookie.setDomain("zenohosp.com") sends "Domain=zenohosp.com" without a leading dot.
     * Browsers need the leading dot to send the cookie to all subdomains (*.zenohosp.com).
     * Java's Cookie API cannot set this, so we write the header manually — same as Directory backend.
     *
     * Production (secure=true):  Domain=.zenohosp.com; Secure; SameSite=None
     * Development (secure=false): no Domain; no Secure; SameSite=Lax
     */
    private void setJwtCookieHeader(HttpServletResponse response, String token) {
        String header;
        if (cookieSecure) {
            String domain = cookieDomain.startsWith(".") ? cookieDomain.substring(1) : cookieDomain;
            header = String.format(
                "%s=%s; Domain=.%s; Path=/; Max-Age=%d; HttpOnly; Secure; SameSite=None",
                cookieName, token, domain, cookieMaxAge);
        } else {
            header = String.format(
                "%s=%s; Path=/; Max-Age=%d; HttpOnly; SameSite=Lax",
                cookieName, token, cookieMaxAge);
        }
        response.addHeader("Set-Cookie", header);
    }

    /**
     * Clears the JWT cookie with EXACTLY the same attributes it was set with.
     * The Domain must match (including leading dot) or the browser ignores the clear.
     */
    private void clearJwtCookieHeader(HttpServletResponse response) {
        String header;
        if (cookieSecure) {
            String domain = cookieDomain.startsWith(".") ? cookieDomain.substring(1) : cookieDomain;
            header = String.format(
                "%s=; Domain=.%s; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None",
                cookieName, domain);
        } else {
            header = String.format(
                "%s=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
                cookieName);
        }
        response.addHeader("Set-Cookie", header);
    }
}
