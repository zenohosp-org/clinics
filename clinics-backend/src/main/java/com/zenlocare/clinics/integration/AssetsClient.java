package com.zenlocare.clinics.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Thin HTTP client for the asset-manager service (api-asset.zenohosp.com).
 *
 * Used by {@link com.zenlocare.clinics.controller.AssetProxyController}
 * to forward asset retrieval calls. Same pattern as {@link LabsClient} —
 * caller's JWT is forwarded so the upstream service validates the same
 * identity HMS just validated; upstream 4xx/5xx pass through verbatim;
 * network failures map to 502.
 *
 * Scope is intentionally read-only ({@link #proxyJson} forwards any verb,
 * but the only mapped routes today are GETs). Asset writes — create,
 * update, room-assign — still go through HMS's existing local controllers
 * because they touch HMS-side rooms/beds.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AssetsClient {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${assets.api.url}")
    private String assetsApiUrl;

    /**
     * Boolean check: "does any room in this list have at least one
     * asset attached?". Backs the InfrastructureService warning
     * before a room-delete. Forwards the current request's JWT
     * (read off SecurityContextHolder so the call site doesn't have
     * to thread it through) — upstream resolves hospital scoping from
     * the same claims. Caller must invoke this from a request-handling
     * thread; falls back to {@code false} on network failure so the
     * warning is treated as "no", which preserves "fail open" semantics
     * for a non-blocking UI hint.
     */
    public boolean existsByRooms(List<Long> roomIds) {
        if (roomIds == null || roomIds.isEmpty()) return false;
        String jwt = currentJwt();
        String csv = roomIds.stream().map(String::valueOf).collect(Collectors.joining(","));
        String url = UriComponentsBuilder.fromUriString(assetsApiUrl)
                .path("/api/assets/exists-by-rooms")
                .queryParam("roomIds", csv)
                .toUriString();
        try {
            ResponseEntity<String> resp = restTemplate.exchange(
                    url, HttpMethod.GET, new HttpEntity<>(authHeaders(jwt)), String.class);
            JsonNode body = objectMapper.readTree(resp.getBody() == null ? "{}" : resp.getBody());
            return body.path("exists").asBoolean(false);
        } catch (Exception e) {
            log.warn("Assets exists-by-rooms unreachable, treating as 'no assets': {}",
                    e.getMessage());
            return false;
        }
    }

    private String currentJwt() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return (auth != null && auth.getCredentials() instanceof String s) ? s : null;
    }

    /**
     * Forward an HTTP call to the asset-manager service. Path, query
     * string, body, and JWT are preserved; the upstream response
     * (status + body) is echoed back so the frontend sees the
     * asset-manager contract verbatim.
     */
    public ResponseEntity<String> proxyJson(HttpMethod method, String path,
                                            String queryString, String body, String jwt) {
        StringBuilder url = new StringBuilder(assetsApiUrl).append(path);
        if (queryString != null && !queryString.isBlank()) url.append('?').append(queryString);
        HttpEntity<String> entity = new HttpEntity<>(body, authHeaders(jwt));
        try {
            ResponseEntity<String> upstream = restTemplate.exchange(url.toString(), method, entity, String.class);
            // Repackage status + body only. Forwarding upstream headers verbatim
            // double-stamps Transfer-Encoding (Tomcat adds its own when the
            // body is materialised as a String), which corrupts chunk framing
            // for any payload large enough to be chunked.
            return ResponseEntity.status(upstream.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(upstream.getBody());
        } catch (HttpStatusCodeException e) {
            log.warn("Assets proxy {} {} returned {}: {}", method, path, e.getStatusCode(),
                    e.getResponseBodyAsString());
            return ResponseEntity.status(e.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("Assets proxy {} {} unreachable: {}", method, path, e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Asset-manager service unreachable: " + e.getMessage(), e);
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
}
