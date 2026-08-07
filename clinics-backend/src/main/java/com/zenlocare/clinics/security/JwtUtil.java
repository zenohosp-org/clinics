package com.zenlocare.clinics.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

@Slf4j
@Component
public class JwtUtil {

    @Value("${jwt.secret}")
    private String secretString;

    @Value("${jwt.expiration}")
    private long expirationSeconds;

    private SecretKey secretKey;

    @PostConstruct
    public void init() {
        this.secretKey = Keys.hmacShaKeyFor(secretString.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Generate a JWT token for an authenticated staff member.
     *
     * @param email      the user's email (subject)
     * @param role       the user's role (claim)
     * @param hospitalId the user's hospital ID (claim, nullable for unlinked users)
     */
    public String generateToken(String email, String role, String hospitalId) {
        return Jwts.builder()
                .subject(email)
                .claim("role", role)
                .claim("hospitalId", hospitalId)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expirationSeconds * 1000))
                .signWith(secretKey)
                .compact();
    }

    /** Extract the email from a token. Prefers 'email' claim, falls back to subject (sub). */
    public String extractEmail(String token) {
        Claims claims = parseClaims(token);
        String email = (String) claims.get("email");
        if (email == null) {
            email = claims.getSubject();
        }
        if (email == null) {
            log.error("JWT does not contain email or sub claim");
        }
        return email;
    }

    public String extractRole(String token) {
        Object role = parseClaims(token).get("role");
        return role == null ? null : role.toString().toLowerCase();
    }

    /** Extract the hospitalId claim. Supports both String and UUID formats. */
    public UUID extractHospitalId(String token) {
        Object val = parseClaims(token).get("hospitalId");
        if (val == null) return null;
        if (val instanceof UUID) return (UUID) val;
        try {
            return UUID.fromString(val.toString());
        } catch (IllegalArgumentException e) {
            log.warn("Invalid hospitalId UUID in token: {}", val);
            return null;
        }
    }

    /** Return true if the token is structurally valid and not expired. */
    public boolean isTokenValid(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            log.warn("Invalid JWT: {}", e.getMessage());
            return false;
        }
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
