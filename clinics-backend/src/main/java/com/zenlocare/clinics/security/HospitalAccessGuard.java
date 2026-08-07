package com.zenlocare.clinics.security;

import com.zenlocare.clinics.entity.User;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Centralized multi-tenancy enforcement: rejects requests where the authenticated
 * user's hospital does not match the {@code hospitalId} they're querying.
 *
 * Super admins (role "super_admin") bypass the check and may access any hospital.
 *
 * Use at the top of every controller method that accepts a {@code hospitalId}
 * query parameter to prevent cross-tenant data leaks.
 */
@Component
public class HospitalAccessGuard {

    /**
     * Throws {@link AccessDeniedException} if the current authenticated user is not
     * allowed to access data for the given hospital.
     */
    public void requireAccess(UUID hospitalId) {
        if (hospitalId == null) {
            throw new AccessDeniedException("hospitalId is required");
        }
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof User user)) {
            throw new AccessDeniedException("Not authenticated");
        }
        // Super admin bypass — no hospital association required.
        if (isSuperAdmin(user)) return;

        UUID userHospitalId = user.getHospital() != null ? user.getHospital().getId() : null;
        if (userHospitalId == null) {
            throw new AccessDeniedException("User has no hospital association");
        }
        if (!userHospitalId.equals(hospitalId)) {
            throw new AccessDeniedException("Cross-hospital access denied");
        }
    }

    private boolean isSuperAdmin(User user) {
        return user.getRole() != null
                && "super_admin".equalsIgnoreCase(user.getRole().getName());
    }
}
