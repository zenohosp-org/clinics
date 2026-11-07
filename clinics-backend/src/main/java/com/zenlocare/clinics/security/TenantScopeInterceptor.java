package com.zenlocare.clinics.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

import java.util.Map;
import java.util.UUID;

/**
 * A {@code hospitalId} named in the query string or the path must be the
 * caller's own hospital. Every hospital shares one database, and more than a
 * hundred endpoints scope their query by this value, so it is checked once
 * here rather than in each of them. A super admin may name any hospital.
 */
@Component
@RequiredArgsConstructor
public class TenantScopeInterceptor implements HandlerInterceptor {

    static final String PARAM = "hospitalId";

    private final HospitalAccessGuard guard;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (guard.currentUser() == null || guard.currentIsSuperAdmin()) return true;

        String fromQuery = request.getParameter(PARAM);
        if (fromQuery != null && !fromQuery.isBlank()) {
            requireOwn(fromQuery);
        }
        @SuppressWarnings("unchecked")
        Map<String, String> pathVars = (Map<String, String>) request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        if (pathVars != null && pathVars.get(PARAM) != null) {
            requireOwn(pathVars.get(PARAM));
        }
        return true;
    }

    private void requireOwn(String requested) {
        UUID own = guard.currentHospitalId();
        UUID asked;
        try {
            asked = UUID.fromString(requested.trim());
        } catch (IllegalArgumentException e) {
            throw new AccessDeniedException("Cross-hospital access denied");
        }
        if (!asked.equals(own)) {
            throw new AccessDeniedException("Cross-hospital access denied");
        }
    }
}
