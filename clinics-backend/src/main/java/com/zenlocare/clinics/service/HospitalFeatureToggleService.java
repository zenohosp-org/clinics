package com.zenlocare.clinics.service;

import com.zenlocare.clinics.entity.HospitalFeatureToggle;
import com.zenlocare.clinics.repository.HospitalFeatureToggleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Per-hospital UI feature toggles.
 *
 * Defaults: every supported feature is enabled until an admin disables it.
 * Toggles only affect UI surface area — backend endpoints stay functional
 * regardless of the toggle state, so existing integrations don't break.
 */
@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class HospitalFeatureToggleService {

    /**
     * Canonical list of features that admins are allowed to toggle from the
     * General Settings page. Anything outside this set is rejected.
     */
    public static final List<String> SUPPORTED_FEATURES = List.of(
            "AMBULANCE",
            "RADIOLOGY",
            "HEALTH_CHECKUPS",
            "IPD"
    );

    private final HospitalFeatureToggleRepository repository;

    public Map<String, Boolean> getAllForHospital(UUID hospitalId) {
        Map<String, Boolean> result = new LinkedHashMap<>();
        for (String key : SUPPORTED_FEATURES) {
            result.put(key, Boolean.TRUE);
        }
        for (HospitalFeatureToggle row : repository.findByHospitalId(hospitalId)) {
            if (SUPPORTED_FEATURES.contains(row.getFeatureKey())) {
                result.put(row.getFeatureKey(), Boolean.TRUE.equals(row.getEnabled()));
            }
        }
        return result;
    }

    @Transactional
    public Map<String, Boolean> setToggle(UUID hospitalId, String featureKey, boolean enabled) {
        if (!SUPPORTED_FEATURES.contains(featureKey)) {
            throw new IllegalArgumentException("Unknown feature key: " + featureKey);
        }
        HospitalFeatureToggle row = repository.findByHospitalIdAndFeatureKey(hospitalId, featureKey)
                .orElseGet(() -> HospitalFeatureToggle.builder()
                        .hospitalId(hospitalId)
                        .featureKey(featureKey)
                        .enabled(enabled)
                        .build());
        row.setEnabled(enabled);
        repository.save(row);
        return getAllForHospital(hospitalId);
    }
}
