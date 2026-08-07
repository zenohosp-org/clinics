package com.zenlocare.clinics.integration;

import com.zenlocare.clinics.integration.dto.LabsCheckupBookingRequest;
import com.zenlocare.clinics.integration.dto.LabsCheckupBookingResponse;
import com.zenlocare.clinics.integration.dto.LabsRadiologyOrderDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * Thin HTTP client for the labs service. All calls forward the caller's
 * JWT (the same one HMS's JwtAuthFilter validated) so labs validates
 * the same identity. Errors from labs surface as ResponseStatusException
 * carrying labs' status code, which Spring's default exception handler
 * returns to the original HMS caller verbatim — no behavioural shift
 * compared to the previous in-process invocation.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LabsClient {

    private final RestTemplate restTemplate;

    @Value("${labs.api.url}")
    private String labsApiUrl;

    /**
     * POST {labs.api.url}/api/health-checkups/bookings.
     * Replaces the in-process HealthCheckupService.createBooking call from
     * AppointmentService when an appointment is created with a package.
     *
     * @param request the booking shape labs expects (matches HMS's old
     *                inner HealthCheckupService.BookingRequest type)
     * @param jwt     the caller's raw JWT (lives in
     *                Authentication.credentials after JwtAuthFilter ran)
     * @return labs' deserialized response — only id is consumed today
     */
    public LabsCheckupBookingResponse createHealthCheckupBooking(LabsCheckupBookingRequest request,
                                                                 String jwt) {
        String url = labsApiUrl + "/api/health-checkups/bookings";
        try {
            ResponseEntity<LabsCheckupBookingResponse> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    new HttpEntity<>(request, authHeaders(jwt)),
                    LabsCheckupBookingResponse.class);
            return response.getBody();
        } catch (HttpStatusCodeException e) {
            throw rethrow(e, "createHealthCheckupBooking");
        } catch (Exception e) {
            log.error("Labs createHealthCheckupBooking unreachable: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Labs service unreachable: " + e.getMessage(), e);
        }
    }

    /**
     * GET {labs.api.url}/api/radiology?hospitalId=...&status=...
     * Used by SmartBillingService to surface pending radiology suggestions
     * during IPD finalize. Issued twice — once for PENDING_SCAN and once
     * for AWAITING_REPORT — and the lists are concatenated so the caller
     * sees a single combined sequence (the same combined set the old
     * in-process query produced via repository filter).
     */
    public List<LabsRadiologyOrderDTO> getPendingRadiologyOrders(UUID hospitalId, String jwt) {
        List<LabsRadiologyOrderDTO> combined = new ArrayList<>();
        combined.addAll(fetchByStatus(hospitalId, "PENDING_SCAN", jwt));
        combined.addAll(fetchByStatus(hospitalId, "AWAITING_REPORT", jwt));
        return combined;
    }

    private List<LabsRadiologyOrderDTO> fetchByStatus(UUID hospitalId, String status, String jwt) {
        String url = UriComponentsBuilder.fromUriString(labsApiUrl)
                .path("/api/radiology")
                .queryParam("hospitalId", hospitalId)
                .queryParam("status", status)
                .toUriString();
        try {
            ResponseEntity<List<LabsRadiologyOrderDTO>> response = restTemplate.exchange(
                    url,
                    HttpMethod.GET,
                    new HttpEntity<>(authHeaders(jwt)),
                    new ParameterizedTypeReference<>() {});
            List<LabsRadiologyOrderDTO> body = response.getBody();
            return body != null ? body : Collections.emptyList();
        } catch (HttpStatusCodeException e) {
            throw rethrow(e, "getPendingRadiologyOrders(status=" + status + ")");
        } catch (Exception e) {
            log.error("Labs getPendingRadiologyOrders(status={}) unreachable: {}", status, e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Labs service unreachable: " + e.getMessage(), e);
        }
    }

    /**
     * Generic JSON proxy. Used by HealthCheckupProxyController to forward
     * every health-checkup request HMS receives to labs verbatim — path,
     * query string, body, JWT all preserved. Response status, headers and
     * body are echoed back to the original caller so the HMS frontend sees
     * labs' exact contract.
     *
     * 4xx/5xx from labs propagate through. Network failures map to 502.
     */
    public ResponseEntity<String> proxyJson(HttpMethod method, String path,
                                            String queryString, String body, String jwt) {
        StringBuilder url = new StringBuilder(labsApiUrl).append(path);
        if (queryString != null && !queryString.isBlank()) url.append('?').append(queryString);
        HttpEntity<String> entity = new HttpEntity<>(body, authHeaders(jwt));
        try {
            return restTemplate.exchange(url.toString(), method, entity, String.class);
        } catch (HttpStatusCodeException e) {
            log.warn("Labs proxy {} {} returned {}: {}", method, path, e.getStatusCode(),
                    e.getResponseBodyAsString());
            return ResponseEntity.status(e.getStatusCode()).body(e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("Labs proxy {} {} unreachable: {}", method, path, e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Labs service unreachable: " + e.getMessage(), e);
        }
    }

    private HttpHeaders authHeaders(String jwt) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (jwt != null && !jwt.isBlank()) {
            headers.setBearerAuth(jwt);
        }
        return headers;
    }

    /**
     * Propagate labs' status code to the original HMS caller. The
     * frontend / OTM / other peers see the same HTTP code labs returned,
     * with a body that includes the upstream payload for diagnostics.
     */
    private ResponseStatusException rethrow(HttpStatusCodeException e, String op) {
        HttpStatusCode status = e.getStatusCode();
        String body = e.getResponseBodyAsString();
        log.warn("Labs {} failed with {}: {}", op, status, body);
        return new ResponseStatusException(status, "Labs " + op + " failed: " + body, e);
    }
}
