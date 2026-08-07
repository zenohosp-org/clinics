package com.zenlocare.clinics.entity;

/**
 * Matches the departments_type_check constraint (People V017) — the six-type
 * classifier shared with the People app. ADMINISTRATIVE was renamed to ADMIN
 * by that migration; deploy this build only after V017 has run.
 */
public enum DepartmentType {
    CLINICAL,
    ADMIN,
    SUPPORT,
    DIAGNOSTIC,
    ANCILLARY,
    OTHER
}
