package com.zenlocare.clinics.dto;

import com.zenlocare.clinics.entity.Admission;
import com.zenlocare.clinics.entity.Bed;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

@Data
@Builder
public class BedDto {
    private Long id;
    private String bedNumber;
    private boolean occupied;
    private boolean underMaintenance;
    /**
     * True when the bed's room has an active admission with no specific bed
     * picked (the legacy "admit to the whole room" flow), which effectively
     * holds every bed in that room. The frontend uses this to grey-out the
     * bed in the picker so users don't try to allocate something the backend
     * will refuse — see {@code AdmissionService.isBedAvailable}.
     */
    private boolean roomLocked;
    private Integer patientId;
    private String patientName;
    private String patientUhid;

    // From the bed's active admission (Admission.bed_id = this.id, status = ADMITTED).
    // Null on empty beds. The frontend needs admissionId to call PUT /api/admissions/{id}/attender.
    private UUID admissionId;
    private String attenderName;
    private String attenderPhone;
    private String attenderRelationship;

    private String wardName;
    private String roomName;
    private String roomType;
    private Long roomId;

    public static BedDto fromEntity(Bed bed) {
        return fromEntity(bed, null, false);
    }

    public static BedDto fromEntity(Bed bed, Admission activeAdmission) {
        return fromEntity(bed, activeAdmission, false);
    }

    public static BedDto fromEntity(Bed bed, Admission activeAdmission, boolean roomLocked) {
        return BedDto.builder()
                .id(bed.getId())
                .bedNumber(bed.getBedNumber())
                .occupied(activeAdmission != null)
                .underMaintenance(bed.isUnderMaintenance())
                .roomLocked(roomLocked)
                .patientId(activeAdmission != null && activeAdmission.getPatient() != null ? activeAdmission.getPatient().getId() : null)
                .patientName(activeAdmission != null && activeAdmission.getPatient() != null
                        ? activeAdmission.getPatient().getFirstName() + " " + activeAdmission.getPatient().getLastName()
                        : null)
                .patientUhid(activeAdmission != null && activeAdmission.getPatient() != null ? activeAdmission.getPatient().getUhid() : null)
                .admissionId(activeAdmission != null ? activeAdmission.getId() : null)
                .attenderName(activeAdmission != null ? activeAdmission.getAttenderName() : null)
                .attenderPhone(activeAdmission != null ? activeAdmission.getAttenderPhone() : null)
                .attenderRelationship(activeAdmission != null ? activeAdmission.getAttenderRelationship() : null)
                .wardName(bed.getWard() != null ? bed.getWard().getName() : (bed.getRoom() != null && bed.getRoom().getHospitalWard() != null ? bed.getRoom().getHospitalWard().getName() : null))
                .roomName(bed.getRoom() != null ? bed.getRoom().getRoomNumber() : null)
                .roomType(bed.getRoom() != null ? bed.getRoom().getRoomType() : (bed.getWard() != null ? bed.getWard().getRoomType() : null))
                .roomId(bed.getRoom() != null ? bed.getRoom().getId() : null)
                .build();
    }
}
