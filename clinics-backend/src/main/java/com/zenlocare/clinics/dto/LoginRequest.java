package com.zenlocare.clinics.dto;

import lombok.Data;

/**
 * Request body for POST /api/auth/login
 */
@Data
public class LoginRequest {
    private String email;
    private String password;
}
