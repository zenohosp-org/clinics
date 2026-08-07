package com.zenlocare.clinics.dto;

import com.zenlocare.clinics.entity.Admission;
import com.zenlocare.clinics.entity.Room;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * API representation of a Room. Mirrors the field shape the frontend already
 * reads (room.attenderName, room.allocationToken, room.currentPatient.*), but
 * resolves attender data from the room's active admission rather than the
 * dropped Room.attender_* columns. `admissionId` is the active admission's
 * UUID (null when none) so the frontend can call PUT /api/admissions/{id}/attender.
 */
@Data
@Builder
public class RoomDto {
    private Long id;
    private String roomNumber;
    private String roomCode;
    private String roomType;
    private String roomCategory;
    private Boolean hasBeds;
    private Boolean hasDailyCharge;
    /**
     * True only when EVERY assignable bed in the room is taken — so a 3-bed
     * room with 1 patient reads as {@code occupied=false} (two beds still
     * available), while a 1-bed PRIVATE room with that same admission reads
     * as occupied. For multi-bed rooms read {@link #bedsTotal} and
     * {@link #bedsOccupied} together with this flag so the UI can render
     * "1/3 occupied" instead of the misleading binary state.
     */
    private boolean occupied;
    /**
     * Total assignable beds physically present in the room (active beds only).
     * Zero for rooms that aren't bed-based (e.g. consultation rooms, OT).
     */
    private int bedsTotal;
    /**
     * Beds currently occupied by an active admission. When an admission holds
     * the room without a specific bed (the legacy "room-level lock" flow),
     * this is forced to {@code bedsTotal} so the UI mirrors the lock.
     */
    private int bedsOccupied;
    private boolean underMaintenance;
    private BigDecimal pricePerDay;

    private PatientLite currentPatient;

    // From the active admission (status = ADMITTED, room_id = this.id), null otherwise.
    private UUID admissionId;
    private String attenderName;
    private String attenderPhone;
    private String attenderRelationship;

    private String allocationToken;
    private LocalDateTime approxDischargeTime;
    private LocalDateTime admissionDate;
    private String wardName;
    private String floorName;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @Data
    @Builder
    public static class PatientLite {
        private Integer id;
        private String firstName;
        private String lastName;
        private String uhid;
        private String phone;
    }

    public static RoomDto fromEntity(Room room, Admission activeAdmission, com.zenlocare.clinics.entity.RoomTypeConfig config) {
        // Single-arg compatibility path — preserves the pre-multi-bed semantics
        // for one-off callers (e.g. RoomService.updateRoom) that don't yet know
        // how many beds the room has. bedsTotal stays 0 so the UI falls back
        // to the legacy binary occupied flag for these rows.
        return fromEntity(room, activeAdmission, config, 0, 0, false);
    }

    /**
     * Multi-bed-aware factory used by the batched rooms-list path. {@code bedsTotal}
     * is the count of active beds in the room and {@code bedsOccupied} is how many
     * of them are taken right now. When {@code roomLockedByBedlessAdmission} is
     * true (the legacy "admit to whole room with bed_id=NULL" flow), bedsOccupied
     * is forced to bedsTotal so the UI mirrors the lock — half-state isn't
     * possible if any admission claims the room without a bed.
     */
    public static RoomDto fromEntity(Room room,
                                     Admission activeAdmission,
                                     com.zenlocare.clinics.entity.RoomTypeConfig config,
                                     int bedsTotal,
                                     int bedsOccupied,
                                     boolean roomLockedByBedlessAdmission) {
        PatientLite p = null;
        if (activeAdmission != null && activeAdmission.getPatient() != null) {
            p = PatientLite.builder()
                    .id(activeAdmission.getPatient().getId())
                    .firstName(activeAdmission.getPatient().getFirstName())
                    .lastName(activeAdmission.getPatient().getLastName())
                    .uhid(activeAdmission.getPatient().getUhid())
                    .phone(activeAdmission.getPatient().getPhone())
                    .build();
        }

        // A bed-less admission consumes the whole room; surface that as full
        // occupancy regardless of how many beds are physically present.
        int effectiveOccupied = bedsTotal > 0 && roomLockedByBedlessAdmission
                ? bedsTotal
                : Math.min(bedsOccupied, bedsTotal);

        // Multi-bed-aware `occupied`:
        //   - For bedded rooms: true only when every bed is taken.
        //   - For non-bedded rooms (consultation, OT, STORE): fall back to
        //     "is there any active admission here?" — that's still the right
        //     signal because such rooms don't have per-bed allocations.
        boolean occupied = bedsTotal > 0
                ? effectiveOccupied >= bedsTotal
                : activeAdmission != null;

        return RoomDto.builder()
                .id(room.getId())
                .roomNumber(room.getRoomNumber())
                .roomCode(room.getRoomCode())
                .roomType(room.getRoomType())
                .roomCategory(config != null ? config.getCategory() : "WARD")
                .hasBeds(config != null ? config.getHasBeds() : true)
                .hasDailyCharge(config != null ? config.getHasDailyCharge() : true)
                .occupied(occupied)
                .bedsTotal(bedsTotal)
                .bedsOccupied(effectiveOccupied)
                .underMaintenance(room.isUnderMaintenance())
                .pricePerDay(room.getPricePerDay())
                .currentPatient(p)
                .admissionId(activeAdmission != null ? activeAdmission.getId() : null)
                .attenderName(activeAdmission != null ? activeAdmission.getAttenderName() : null)
                .attenderPhone(activeAdmission != null ? activeAdmission.getAttenderPhone() : null)
                .attenderRelationship(activeAdmission != null ? activeAdmission.getAttenderRelationship() : null)
                .allocationToken(null)
                .approxDischargeTime(activeAdmission != null ? activeAdmission.getApproxDischargeDate() : null)
                .admissionDate(activeAdmission != null ? activeAdmission.getAdmissionDate() : null)
                .wardName(room.getHospitalWard() != null ? room.getHospitalWard().getName() : null)
                .floorName(room.getHospitalWard() != null && room.getHospitalWard().getFloor() != null
                        ? room.getHospitalWard().getFloor().getName()
                        : null)
                .createdAt(room.getCreatedAt())
                .updatedAt(room.getUpdatedAt())
                .build();
    }
}
