package com.zenlocare.clinics.entity;

/**
 * Route of administration. Persisted as an integer FK into
 * {@code prescription_routes} via {@link
 * com.zenlocare.clinics.converter.PrescriptionRouteConverter}.
 */
public enum PrescriptionRoute {
    ORAL(1),
    IV(2),
    IM(3),
    SC(4),         // Subcutaneous
    TOPICAL(5),
    INHALED(6),
    OPHTHALMIC(7), // Eye
    OTIC(8),       // Ear
    NASAL(9),
    RECTAL(10);

    public final int id;

    PrescriptionRoute(int id) { this.id = id; }

    public static PrescriptionRoute fromId(int id) {
        for (PrescriptionRoute r : values()) {
            if (r.id == id) return r;
        }
        throw new IllegalArgumentException("Unknown PrescriptionRoute id: " + id);
    }

    public static PrescriptionRoute fromCode(String code) {
        if (code == null || code.isBlank()) return null;
        try {
            return PrescriptionRoute.valueOf(code.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown route: " + code
                    + ". Allowed: ORAL, IV, IM, SC, TOPICAL, INHALED, OPHTHALMIC, OTIC, NASAL, RECTAL");
        }
    }
}
