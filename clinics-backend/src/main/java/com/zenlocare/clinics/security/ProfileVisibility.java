package com.zenlocare.clinics.security;

import com.zenlocare.clinics.entity.User;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.UUID;

/**
 * Who may see a colleague's private profile fields.
 *
 * <p>The rule: anyone in the hospital can look a staff member up — name, role,
 * designation, department, employee code, work email, presence. Personal
 * contact details (login email, personal phone) and government IDs (Aadhaar,
 * PAN) are visible only to the person themselves and to hospital admins.</p>
 *
 * <p>It lives here rather than inline in each controller because the same rule
 * governs {@code /api/users} and {@code /api/doctors}, which map different
 * entities onto the same directory card. Two copies of a privacy rule is one
 * copy too many — they drift, and the drift is silent.</p>
 *
 * <p>Enforcement belongs on the way out of the API, never in the client: a
 * field the payload contains is a field any logged-in user can read from the
 * network tab.</p>
 */
public final class ProfileVisibility {

    private ProfileVisibility() {}

    /** True when the caller is {@code subjectUserId} themselves, or an admin. */
    public static boolean maySeePrivateFieldsOf(UUID subjectUserId) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof User caller)) return false;
        if (subjectUserId != null && subjectUserId.equals(caller.getId())) return true;
        String role = caller.getRole() != null ? caller.getRole().getName() : null;
        return "hospital_admin".equals(role) || "super_admin".equals(role);
    }
}
