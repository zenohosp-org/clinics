package com.zenlocare.clinics.service;

import com.zenlocare.clinics.dto.AuthResponse;
import com.zenlocare.clinics.dto.LoginRequest;
import com.zenlocare.clinics.dto.RegisterRequest;
import com.zenlocare.clinics.entity.Role;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.exception.ConflictException;
import com.zenlocare.clinics.exception.UnauthorizedException;
import com.zenlocare.clinics.repository.RoleRepository;
import com.zenlocare.clinics.repository.UserRepository;
import com.zenlocare.clinics.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final org.springframework.web.client.RestTemplate restTemplate;

    @org.springframework.beans.factory.annotation.Value("${directory.api.url}")
    private String directoryApiUrl;

    /**
     * Authenticate a user with email + password.
     * Directory is the only password authority: credentials are checked there
     * and nowhere else. There is deliberately no local bcrypt fallback — it
     * minted tokens without a modules claim and kept old local passwords alive
     * after Directory changed or revoked them.
     */
    public AuthResponse login(LoginRequest request) {
        String requestEmail = request.getEmail() != null ? request.getEmail().toLowerCase().trim() : null;
        java.util.Map<String, Object> body;
        try {
            log.info("Proxying login for {} to Directory Backend...", requestEmail);
            String directoryLoginUrl = directoryApiUrl + "/api/auth/login";
            var responseEntity = restTemplate.postForEntity(directoryLoginUrl, request, java.util.Map.class);
            body = (java.util.Map<String, Object>) responseEntity.getBody();
        } catch (org.springframework.web.client.HttpClientErrorException ex) {
            // 4xx from Directory: wrong password, unknown or locked account.
            log.warn("Directory rejected login for {}: {}", requestEmail, ex.getStatusCode());
            throw new UnauthorizedException("Invalid email or password");
        } catch (Exception ex) {
            log.error("Directory login unavailable for {}: {}", requestEmail, ex.getMessage());
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                    "Sign-in service is temporarily unavailable. Please try again shortly.");
        }

        if (body == null || !Boolean.TRUE.equals(body.get("success"))
                || !(body.get("data") instanceof java.util.Map<?, ?> rawData)) {
            throw new UnauthorizedException("Invalid email or password");
        }
        java.util.Map<String, Object> data = (java.util.Map<String, Object>) rawData;
        String email = (String) data.get("email");
        String token = (String) data.get("token");
        if (email == null || token == null) {
            throw new UnauthorizedException("Invalid email or password");
        }

        log.info("Directory authentication successful for {}", email);

        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) {
            log.warn("Directory login success but user {} does not exist in HMS DB. Cannot proceed.", email);
            throw new UnauthorizedException("Your account exists in Directory but is not linked to HMS. Please contact your Hospital Admin.");
        }

        if (!Boolean.TRUE.equals(user.getIsActive())) {
            throw new UnauthorizedException("Your account is inactive in HMS. Contact your administrator.");
        }

        // Return the Directory token directly
        String roleName = user.getRole().getName();
        String roleDisplay = user.getRole().getDisplayName();
        UUID hospitalId = user.getHospital() != null ? user.getHospital().getId() : null;
        String hospitalName = user.getHospital() != null ? user.getHospital().getName() : null;

        return buildResponse(token, user, roleName, roleDisplay, hospitalId, hospitalName, "Login successful via Directory");
    }

    /**
     * Self-registration — role defaults to STAFF, hospital unlinked (onboarding
     * links them later).
     */
    public AuthResponse register(RegisterRequest request) {
        String email = request.getEmail() != null ? request.getEmail().toLowerCase().trim() : null;
        if (userRepository.existsByEmail(email)) {
            throw new ConflictException("Email already registered: " + email);
        }

        Role staffRole = roleRepository.findByName("staff")
                .orElseThrow(() -> new IllegalStateException("STAFF role not found — run app to seed roles first"));

        User user = User.builder()
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .phone(request.getPhone())
                .role(staffRole)
                .isActive(true)
                .build();

        userRepository.save(user);

        String token = jwtUtil.generateToken(user.getEmail(), staffRole.getName(), null);

        log.info("New user registered: {}", user.getEmail());

        return buildResponse(token, user, staffRole.getName(), staffRole.getDisplayName(), null, null,
                "Registration successful. Complete onboarding to join a hospital.");
    }

    /**
     * Returns the profile of the currently authenticated user.
     */
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public AuthResponse getProfile(User user) {
        if (user == null) {
            log.warn("getProfile called with NULL user principal");
            throw new UnauthorizedException("Session expired or invalid token");
        }
        
        log.info("Retrieving profile for user: {}", user.getEmail());
        try {
            // Reload user from DB to ensure relationships are accessible in this transaction
            User managedUser = userRepository.findById(user.getId())
                    .orElseThrow(() -> new UnauthorizedException("User no longer exists"));

            String roleName = managedUser.getRole().getName();
            String roleDisplay = managedUser.getRole().getDisplayName();
            UUID hospitalId = managedUser.getHospital() != null ? managedUser.getHospital().getId() : null;
            String hospitalName = managedUser.getHospital() != null ? managedUser.getHospital().getName() : null;

            return buildResponse(null, managedUser, roleName, roleDisplay, hospitalId, hospitalName, "Profile retrieved");
        } catch (Exception e) {
            log.error("Error building profile for user {}: {}", user.getEmail(), e.getMessage(), e);
            throw e;
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private AuthResponse buildResponse(String token, User user, String roleName, String roleDisplay,
            UUID hospitalId, String hospitalName, String message) {
        return AuthResponse.builder()
                .token(token)
                .userId(user.getId())
                .email(user.getEmail())
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .role(roleName)
                .roleDisplay(roleDisplay)
                .hospitalId(hospitalId)
                .hospitalName(hospitalName)
                .isActive(user.getIsActive())
                .message(message)
                .build();
    }
}
