package com.zenlocare.clinics.security;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Loads the OAuth2 user by parsing the JWT access token returned by the Directory server.
 * Avoids an extra HTTP round-trip to the user-info endpoint — the JWT already carries
 * all needed claims (email, role, hospitalId) signed with the shared JWT_SECRET.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CustomOAuth2UserService extends DefaultOAuth2UserService {

    private final JwtUtil jwtUtil;

    @Override
    public OAuth2User loadUser(OAuth2UserRequest userRequest) throws OAuth2AuthenticationException {
        String registrationId = userRequest.getClientRegistration().getRegistrationId();

        if ("directory".equalsIgnoreCase(registrationId)) {
            return loadFromDirectoryJwt(userRequest);
        }

        return super.loadUser(userRequest);
    }

    private OAuth2User loadFromDirectoryJwt(OAuth2UserRequest userRequest) {
        String accessToken = userRequest.getAccessToken().getTokenValue();
        try {
            String email = jwtUtil.extractEmail(accessToken);
            if (email == null) {
                throw new OAuth2AuthenticationException("Directory JWT missing email claim");
            }

            Map<String, Object> attributes = new HashMap<>();
            attributes.put("email", email);

            String role = jwtUtil.extractRole(accessToken);
            if (role != null) attributes.put("role", role);

            log.info("Directory SSO: parsed JWT for email={}", email);
            return new DefaultOAuth2User(
                    List.of(new SimpleGrantedAuthority("ROLE_USER")),
                    attributes,
                    "email"
            );
        } catch (OAuth2AuthenticationException e) {
            throw e;
        } catch (Exception e) {
            log.error("Directory SSO: failed to parse JWT access token: {}", e.getMessage());
            throw new OAuth2AuthenticationException("Failed to parse Directory JWT: " + e.getMessage());
        }
    }
}
