package com.zenlocare.clinics.security;

import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Map;

/**
 * Handles successful Directory SSO login.
 *
 * The Directory server has already:
 *  1. Authenticated the user
 *  2. Set the HttpOnly sso_token cookie (Domain=.zenohosp.com)
 *  3. Issued the JWT as the OAuth2 access token
 *
 * This handler only validates the user exists and is active in HMS,
 * then redirects to /sso/callback — no new JWT or cookie needed.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DirectorySsoSuccessHandler implements AuthenticationSuccessHandler {

    private final UserRepository userRepository;

    @Value("${frontend.url}")
    private String frontendUrl;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                         HttpServletResponse response,
                                         Authentication authentication) throws IOException {
        try {
            OAuth2AuthenticationToken oauthToken = (OAuth2AuthenticationToken) authentication;
            Map<String, Object> attributes = oauthToken.getPrincipal().getAttributes();

            String email = (String) attributes.get("email");
            if (email == null) {
                log.error("Directory SSO: email attribute missing. Keys: {}", attributes.keySet());
                response.sendRedirect(frontendUrl + "/login?error=sso_failed");
                return;
            }

            User user = userRepository.findByEmail(email).orElse(null);

            if (user == null) {
                log.warn("Directory SSO: no HMS user found for email={}", email);
                response.sendRedirect(frontendUrl + "/login?error=user_not_found");
                return;
            }

            if (!Boolean.TRUE.equals(user.getIsActive())) {
                log.warn("Directory SSO: account inactive for email={}", email);
                response.sendRedirect(frontendUrl + "/login?error=account_inactive");
                return;
            }

            // Directory already set the sso_token HttpOnly cookie — just redirect
            // (Directory already validated HMS module access before issuing the JWT)
            log.info("Directory SSO: login success for email={}", email);
            response.sendRedirect(frontendUrl + "/sso/callback");

        } catch (Exception e) {
            log.error("Directory SSO: unexpected error: {}", e.getMessage(), e);
            response.sendRedirect(frontendUrl + "/login?error=internal_server_error");
        }
    }
}
