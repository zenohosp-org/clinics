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
     * Returns a JWT + user context on success.
     */
    public AuthResponse login(LoginRequest request) {
        String requestEmail = request.getEmail() != null ? request.getEmail().toLowerCase().trim() : null;
        // 1. Try to authenticate with Directory Backend first
        try {
            log.info("Proxying login for {} to Directory Backend...", requestEmail);
            String directoryLoginUrl = directoryApiUrl + "/api/auth/login";
            
            var responseEntity = restTemplate.postForEntity(directoryLoginUrl, request, java.util.Map.class);
            
            if (responseEntity.getStatusCode().is2xxSuccessful() && responseEntity.getBody() != null) {
                java.util.Map<String, Object> body = (java.util.Map<String, Object>) responseEntity.getBody();
                if (Boolean.TRUE.equals(body.get("success"))) {
                    java.util.Map<String, Object> data = (java.util.Map<String, Object>) body.get("data");
                    String email = (String) data.get("email");
                    
                    log.info("Directory authentication successful for {}", email);
                    
                    // 2. Look up or sync user locally
                    User user = userRepository.findByEmail(email).orElse(null);
                    if (user == null) {
                        log.warn("Directory login success but user {} does not exist in HMS DB. Cannot proceed.", email);
                        throw new UnauthorizedException("Your account exists in Directory but is not linked to HMS. Please contact your Hospital Admin.");
                    }
                    
                    if (!Boolean.TRUE.equals(user.getIsActive())) {
                        throw new UnauthorizedException("Your account is inactive in HMS. Contact your administrator.");
                    }

                    // 3. Return the Directory token directly
                    String token = (String) data.get("token");
                    String roleName = user.getRole().getName();
                    String roleDisplay = user.getRole().getDisplayName();
                    UUID hospitalId = user.getHospital() != null ? user.getHospital().getId() : null;
                    String hospitalName = user.getHospital() != null ? user.getHospital().getName() : null;

                    return buildResponse(token, user, roleName, roleDisplay, hospitalId, hospitalName, "Login successful via Directory");
                }
            }
        } catch (Exception ex) {
            log.warn("Directory login failed/skipped for {}: {}", request.getEmail(), ex.getMessage());
            // Fallback to local login if needed, or re-throw
        }

        // 4. Local Authentication Fallback
        User user = userRepository.findByEmail(requestEmail)
                .orElseThrow(() -> new UnauthorizedException("Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new UnauthorizedException("Invalid email or password");
        }

        if (!Boolean.TRUE.equals(user.getIsActive())) {
            throw new UnauthorizedException("Your account is inactive. Contact your administrator.");
        }

        String roleName = user.getRole().getName();
        String roleDisplay = user.getRole().getDisplayName();
        UUID hospitalId = user.getHospital() != null ? user.getHospital().getId() : null;
        String hospitalName = user.getHospital() != null ? user.getHospital().getName() : null;

        String token = jwtUtil.generateToken(user.getEmail(), roleName,
                hospitalId != null ? hospitalId.toString() : null);

        log.info("User logged in: {} ({})", user.getEmail(), roleName);

        return buildResponse(token, user, roleName, roleDisplay, hospitalId, hospitalName, "Login successful");
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
