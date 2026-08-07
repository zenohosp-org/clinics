package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.service.HospitalFeatureToggleService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/settings/features")
@RequiredArgsConstructor
public class HospitalFeatureToggleController {

    private final HospitalFeatureToggleService service;

    /**
     * Read-only fetch — any authenticated user can pull the toggle map so the
     * sidebar/UI can decide what to render.
     */
    @GetMapping
    public ResponseEntity<FeatureFlagsResponse> getFlags(@RequestParam UUID hospitalId) {
        return ResponseEntity.ok(new FeatureFlagsResponse(
                service.getAllForHospital(hospitalId),
                HospitalFeatureToggleService.SUPPORTED_FEATURES
        ));
    }

    @PutMapping
    @PreAuthorize("hasAnyRole('hospital_admin','super_admin')")
    public ResponseEntity<FeatureFlagsResponse> setFlag(
            @RequestParam UUID hospitalId,
            @RequestBody ToggleRequest body
    ) {
        Map<String, Boolean> updated = service.setToggle(hospitalId, body.getKey(), body.isEnabled());
        return ResponseEntity.ok(new FeatureFlagsResponse(
                updated,
                HospitalFeatureToggleService.SUPPORTED_FEATURES
        ));
    }

    @Data
    public static class ToggleRequest {
        private String key;
        private boolean enabled;
    }

    @Data
    public static class FeatureFlagsResponse {
        private final Map<String, Boolean> flags;
        private final List<String> supported;
    }
}
