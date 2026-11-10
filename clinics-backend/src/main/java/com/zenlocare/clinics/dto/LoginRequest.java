package com.zenlocare.clinics.dto;

import lombok.Data;
import lombok.ToString;

/**
 * Request body for POST /api/auth/login
 */
@Data
public class LoginRequest {
    private String email;
    @ToString.Exclude
    private String password;
}
