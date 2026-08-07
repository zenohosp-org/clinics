package com.zenlocare.clinics.security;

import com.zenlocare.clinics.entity.Role;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.repository.RoleRepository;
import com.zenlocare.clinics.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * After successful Google login:
 *  1. Extract email + googleId from the OIDC token.
 *  2. Find the existing user by email OR create a new staff user.
 *  3. Save / update googleId on the user record.
 *  4. Set JWT as an HttpOnly cookie via raw Set-Cookie header.
 *  5. Redirect to /sso/callback — no token in the URL.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GoogleOAuth2SuccessHandler implements AuthenticationSuccessHandler {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final JwtUtil jwtUtil;

    @Value("${frontend.url}")
    private String frontendUrl;

    @Value("${sso.cookie.name:sso_token}")
    private String cookieName;

    @Value("${sso.cookie.domain:localhost}")
    private String cookieDomain;

    @Value("${sso.cookie.secure:false}")
    private boolean cookieSecure;

    @Value("${sso.cookie.max-age:86400}")
    private int cookieMaxAge;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException {

        OidcUser oidcUser = (OidcUser) authentication.getPrincipal();

        String email     = oidcUser.getEmail();
        String googleId  = oidcUser.getSubject();
        String firstName = oidcUser.getGivenName() != null ? oidcUser.getGivenName() : email;
        String lastName  = oidcUser.getFamilyName();

        // Role names are lowercase in the DB (Role.normalizeCase() enforces this)
        User user = userRepository.findByEmail(email).orElseGet(() -> {
            Role staffRole = roleRepository.findByName("staff")
                    .orElseThrow(() -> new IllegalStateException("'staff' role not found in database"));

            return User.builder()
                    .email(email)
                    .firstName(firstName)
                    .lastName(lastName)
                    .googleId(googleId)
                    .role(staffRole)
                    .isActive(true)
                    .build();
        });

        if (!Boolean.TRUE.equals(user.getIsActive())) {
            log.warn("Google OAuth2: account inactive for email={}", email);
            response.sendRedirect(frontendUrl + "/login?error=account_inactive");
            return;
        }

        if (user.getGoogleId() == null) {
            user.setGoogleId(googleId);
        }

        userRepository.save(user);

        String roleName   = user.getRole().getName(); // lowercase: "staff", "doctor", etc.
        String hospitalId = user.getHospital() != null ? user.getHospital().getId().toString() : null;
        String token      = jwtUtil.generateToken(email, roleName, hospitalId);

        setJwtCookieHeader(response, token);

        log.info("Google OAuth2 login success for: {} ({})", email, roleName);
        response.sendRedirect(frontendUrl + "/sso/callback");
    }

    /**
     * Sets the JWT cookie using a raw Set-Cookie header.
     * In production (secure=true): Domain=.zenohosp.com; Secure; SameSite=None
     * In development (secure=false): no Domain, no Secure, SameSite=Lax
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
}
