package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.integration.LabsClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

/**
 * Health-checkup proxy. Labs is the sole owner of the
 * health_checkup_bookings / health_packages tables; HMS no longer maps the
 * entities. The HMS frontend still calls /api/health-checkups/* on its own
 * backend (single origin, single auth flow, single log stream) and this
 * controller forwards every request to labs verbatim.
 *
 * Path, query string, JSON body, JWT, response status and response body
 * are all preserved end-to-end. The HMS frontend's checkupApi sees
 * labs' exact contract without knowing labs exists.
 *
 * Used in conjunction with LabsClient.proxyJson for the wire layer.
 */
@RestController
@RequestMapping("/api/health-checkups")
@RequiredArgsConstructor
@Slf4j
public class HealthCheckupProxyController {

    private final LabsClient labsClient;

    @RequestMapping(value = {"", "/**"},
            method = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT,
                      RequestMethod.PATCH, RequestMethod.DELETE})
    public ResponseEntity<String> proxy(HttpServletRequest request,
                                        @RequestBody(required = false) String body) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String jwt = (auth != null && auth.getCredentials() instanceof String s) ? s : null;

        HttpMethod method = HttpMethod.valueOf(request.getMethod());
        String path = request.getRequestURI();      // e.g. /api/health-checkups/packages
        String queryString = request.getQueryString();

        return labsClient.proxyJson(method, path, queryString, body, jwt);
    }
}
