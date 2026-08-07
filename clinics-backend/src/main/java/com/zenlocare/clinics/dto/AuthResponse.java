package com.zenlocare.clinics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * Response body for successful authentication.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {
    private String token;
    private UUID userId;
    private String email;
    private String firstName;
    private String lastName;
    private String role; // Role name: "SUPER_ADMIN", "HOSPITAL_ADMIN", "DOCTOR", "STAFF"
    private String roleDisplay; // Friendly: "Super Admin", etc.
    private UUID hospitalId;
    private String hospitalName;
    private Boolean isActive;
    private String message;
}
