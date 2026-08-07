package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.integration.AssetsClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Full proxy that forwards every {@code /api/assets/*} request to the
 * asset-manager service (api-asset.zenohosp.com). HMS no longer keeps
 * a local {@code Asset} entity or repository — asset-manager is the
 * sole writer and reader of the shared {@code assets} table.
 *
 * Frontend contract is preserved verbatim so no React change ships
 * with the migration: the same paths, verbs, and request bodies the
 * HMS frontend has always used continue to work. The proxy translates
 * where asset-manager's contract differs (verb mappings, path rewrites)
 * before forwarding.
 *
 *   GET   /api/assets                       → upstream GET  /api/assets
 *   GET   /api/assets/{id}                  → upstream GET  /api/assets/{id}
 *   GET   /api/assets/room/{roomId}         → upstream GET  /api/assets?roomId={roomId}
 *   GET   /api/assets/available[?q=…]       → upstream GET  /api/assets/unassigned[?q=…]
 *   PATCH /api/assets/{id}/assign-room      → upstream POST /api/assets/{id}/assign-room
 *   PATCH /api/assets/{id}/unassign-room    → upstream POST /api/assets/{id}/unassign-room
 *
 * The caller's JWT is forwarded on every hop; asset-manager derives
 * hospital scoping from the same claims HMS just validated. Frontend
 * body fields that asset-manager doesn't use (e.g. {@code hospitalId}
 * inside the assign-room body) are tolerated — asset-manager's
 * controller pulls only the keys it knows about and trusts JWT
 * scoping for the rest, so we don't need to scrub the body on our
 * side.
 *
 * Same single-origin / single-auth / single-log-stream reasoning as
 * {@link HealthCheckupProxyController}.
 */
@RestController
@RequestMapping("/api/assets")
@RequiredArgsConstructor
@Slf4j
public class AssetProxyController {

    private final AssetsClient assetsClient;

    /**
     * GET /api/assets[?roomId=&sourceItemId=] — pure passthrough.
     * Hospital scoping is derived upstream from the JWT.
     */
    @GetMapping
    public ResponseEntity<String> listAssets(HttpServletRequest request) {
        return assetsClient.proxyJson(HttpMethod.GET,
                "/api/assets", request.getQueryString(), null, currentJwt());
    }

    /**
     * GET /api/assets/{id} — UUID regex avoids shadowing
     * {@link #listByRoom} and {@link #listAvailable}, which sit on
     * non-UUID path segments ({@code /room/…}, {@code /available}).
     */
    @GetMapping("/{id:[0-9a-fA-F-]{36}}")
    public ResponseEntity<String> getAsset(@PathVariable String id, HttpServletRequest request) {
        UUID.fromString(id); // defensive — pattern already enforces
        return assetsClient.proxyJson(HttpMethod.GET,
                "/api/assets/" + id, null, null, currentJwt());
    }

    /**
     * GET /api/assets/room/{roomId} — preserves HMS's historical
     * pretty-path; rewrites to asset-manager's
     * {@code GET /api/assets?roomId={roomId}} on the way out. Frontend's
     * {@code hospitalId} query param is dropped on the wire — upstream
     * derives it from the JWT.
     */
    @GetMapping("/room/{roomId}")
    public ResponseEntity<String> listByRoom(@PathVariable Long roomId) {
        return assetsClient.proxyJson(HttpMethod.GET,
                "/api/assets", "roomId=" + roomId, null, currentJwt());
    }

    /**
     * GET /api/assets/available[?q=…] — preserves the frontend's name;
     * rewrites to asset-manager's {@code GET /api/assets/unassigned}.
     * Forwards the original query string (so {@code q} flows through)
     * even though it also carries {@code hospitalId} — upstream
     * ignores unknown params and derives the hospital from the JWT.
     */
    @GetMapping("/available")
    public ResponseEntity<String> listAvailable(HttpServletRequest request) {
        return assetsClient.proxyJson(HttpMethod.GET,
                "/api/assets/unassigned", request.getQueryString(), null, currentJwt());
    }

    /**
     * PATCH /api/assets/{id}/assign-room — translated to upstream
     * POST. Body is forwarded verbatim ({@code {roomId, hospitalId}});
     * asset-manager's handler reads only {@code roomId} (and optional
     * {@code notes}) and trusts the JWT for hospital scoping, so the
     * extra {@code hospitalId} field is harmlessly ignored.
     */
    @PatchMapping("/{id:[0-9a-fA-F-]{36}}/assign-room")
    public ResponseEntity<String> assignRoom(@PathVariable String id, @RequestBody(required = false) String body) {
        UUID.fromString(id);
        return assetsClient.proxyJson(HttpMethod.POST,
                "/api/assets/" + id + "/assign-room", null, body, currentJwt());
    }

    /**
     * PATCH /api/assets/{id}/unassign-room — translated to upstream
     * POST. Body is optional both sides.
     */
    @PatchMapping("/{id:[0-9a-fA-F-]{36}}/unassign-room")
    public ResponseEntity<String> unassignRoom(@PathVariable String id, @RequestBody(required = false) String body) {
        UUID.fromString(id);
        return assetsClient.proxyJson(HttpMethod.POST,
                "/api/assets/" + id + "/unassign-room", null, body, currentJwt());
    }

    private String currentJwt() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return (auth != null && auth.getCredentials() instanceof String s) ? s : null;
    }
}
