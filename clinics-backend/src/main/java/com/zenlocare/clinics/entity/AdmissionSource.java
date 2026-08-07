package com.zenlocare.clinics.entity;

public enum AdmissionSource {
    OPD_REFERRAL(1),
    EMERGENCY_WALK_IN(2),
    DIRECT(3),
    TRANSFER_IN(4);

    public final int id;

    AdmissionSource(int id) { this.id = id; }

    public static AdmissionSource fromId(int id) {
        for (AdmissionSource s : values()) {
            if (s.id == id) return s;
        }
        throw new IllegalArgumentException("Unknown AdmissionSource id: " + id);
    }
}
