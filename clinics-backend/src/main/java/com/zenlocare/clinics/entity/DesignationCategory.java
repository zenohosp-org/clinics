package com.zenlocare.clinics.entity;

/**
 * Matches the designations_category_check constraint (People V018) — the
 * six-category classifier shared with the People app. MEDICAL→CLINICAL and
 * ADMINISTRATIVE→ADMIN were renamed by that migration; deploy this build
 * only after V018 has run.
 */
public enum DesignationCategory {
    CLINICAL,
    NURSING,
    ADMIN,
    SUPPORT,
    TECHNICAL,
    OTHER
}
