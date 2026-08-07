package com.zenlocare.clinics.entity;

public enum AmbulanceBookingStatus {
    PENDING(1),
    DISPATCHED(2),
    EN_ROUTE(3),
    COMPLETED(4),
    CANCELLED(5);

    public final int id;

    AmbulanceBookingStatus(int id) { this.id = id; }

    public static AmbulanceBookingStatus fromId(int id) {
        for (AmbulanceBookingStatus s : values()) {
            if (s.id == id) return s;
        }
        throw new IllegalArgumentException("Unknown AmbulanceBookingStatus id: " + id);
    }
}
