package com.zenlocare.clinics.dto;

import lombok.Data;
import lombok.ToString;

/**
 * Request body for POST /api/auth/register
 */
@Data
public class RegisterRequest {
    private String email;
    @ToString.Exclude
    private String password;
    private String firstName;
    private String lastName;
    private String phone;
}
