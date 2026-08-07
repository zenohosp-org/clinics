package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.integration.LabsClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only proxy for the labs investigation catalogue (lab_services).
 *
 * Labs is the single source of truth for the pathology + radiology test
 * catalogue. HMS no longer infers lab-vs-radiology from department.code;
 * the order picker reads this catalogue and routes each order by the
 * labs-supplied {@code billingRoute} field. Catalogue rows are created and
 * edited in the labs app — this proxy is GET-only by design.
 *
 * The HMS frontend calls {@code /api/lab-services*} on its own origin
 * (single SSO cookie, single log stream); every GET is forwarded to labs
 * verbatim with the doctor's JWT, mirroring {@link HealthCheckupProxyController}.
 * Labs reads {@code hospitalId} straight off the forwarded claim, so no
 * token re-mint and no {@code ?hospitalId=} injection is needed.
 *
 * NOTE: {@link LabsClient#proxyJson} echoes labs' status + body but not
 * response headers, so labs' {@code ETag} / {@code Cache-Control} /
 * {@code X-Total-Count} are not yet surfaced to the SPA. When labs ships the
 * paged envelope + ETag (their Phase 8.2), swap to a header-preserving
 * forward so HMS can do {@code If-None-Match} revalidation and read the
 * pagination headers. Functionally the body (raw list today, envelope after
 * 8.2) passes through unchanged either way.
 */
@RestController
@RequestMapping("/api/lab-services")
@RequiredArgsConstructor
@Slf4j
public class LabServicesProxyController {

    private final LabsClient labsClient;

    @RequestMapping(value = {"", "/**"}, method = RequestMethod.GET)
    public ResponseEntity<String> proxy(HttpServletRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String jwt = (auth != null && auth.getCredentials() instanceof String s) ? s : null;

        String path = request.getRequestURI();           // e.g. /api/lab-services/search
        String queryString = request.getQueryString();   // e.g. page=0&size=200&active=true

        return labsClient.proxyJson(HttpMethod.GET, path, queryString, null, jwt);
    }
}
