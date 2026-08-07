package com.zenlocare.clinics.entity;

public enum AmbulanceVehicleStatus {
    AVAILABLE(1),
    IN_USE(2),
    MAINTENANCE(3);

    public final int id;

    AmbulanceVehicleStatus(int id) { this.id = id; }

    public static AmbulanceVehicleStatus fromId(int id) {
        for (AmbulanceVehicleStatus s : values()) {
            if (s.id == id) return s;
        }
        throw new IllegalArgumentException("Unknown AmbulanceVehicleStatus id: " + id);
    }
}
