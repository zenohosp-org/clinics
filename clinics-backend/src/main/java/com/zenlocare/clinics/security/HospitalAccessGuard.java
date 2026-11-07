package com.zenlocare.clinics.security;

import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
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

    /** The signed-in user, or null when the request carries no login. */
    public User currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getPrincipal() instanceof User user ? user : null;
    }

    /** True when the caller is a super admin, who may act in any hospital. */
    public boolean currentIsSuperAdmin() {
        User user = currentUser();
        return user != null && isSuperAdmin(user);
    }

    /** The caller's own hospital; null for a super admin, who has none. */
    public UUID currentHospitalId() {
        User user = currentUser();
        if (user == null) {
            throw new AccessDeniedException("Not authenticated");
        }
        if (isSuperAdmin(user)) return null;
        if (user.getHospital() == null) {
            throw new AccessDeniedException("User has no hospital association");
        }
        return user.getHospital().getId();
    }

    /**
     * For a record loaded by id: it must belong to the caller's hospital.
     * Another hospital's record answers exactly like a missing one, so ids
     * can't be probed across hospitals.
     */
    public void requireOwns(UUID recordHospitalId, String what) {
        UUID own = currentHospitalId();
        if (own == null) return;
        if (recordHospitalId == null || !own.equals(recordHospitalId)) {
            throw new ResourceNotFoundException(what + " not found");
        }
    }

    private boolean isSuperAdmin(User user) {
        return user.getRole() != null
                && "super_admin".equalsIgnoreCase(user.getRole().getName());
    }
}
