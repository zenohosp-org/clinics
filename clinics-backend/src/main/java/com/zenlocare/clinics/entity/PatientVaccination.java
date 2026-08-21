package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * A single dose on a patient's immunization timeline — either due
 * (SCHEDULED) or given (ADMINISTERED). One row per dose, so a baby's full
 * vaccination history is just this table filtered by patient_id, ordered by
 * scheduled_date.
 *
 * vaccineName is a snapshot (not a live join through vaccineId) so the
 * timeline reads correctly even if the catalog row is retired later, and so
 * a clinic can log a custom/off-catalog vaccine with vaccineId left null.
 */
@Entity
@Table(
    name = "patient_vaccinations",
    indexes = {
        @Index(name = "idx_patient_vaccinations_patient", columnList = "patient_id"),
        @Index(name = "idx_patient_vaccinations_hospital", columnList = "hospital_id")
    }
)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PatientVaccination {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "patient_id", nullable = false)
    private Integer patientId;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    /** Nullable — a custom/off-catalog vaccine has no catalog row to point at. */
    @Column(name = "vaccine_id")
    private UUID vaccineId;

    @Column(name = "vaccine_name", nullable = false, length = 150)
    private String vaccineName;

    @Column(name = "dose_number")
    private Integer doseNumber;

    @Column(name = "scheduled_date", nullable = false)
    private LocalDate scheduledDate;

    @Column(name = "administered_date")
    private LocalDate administeredDate;

    /** SCHEDULED | ADMINISTERED | MISSED | SKIPPED */
    @Column(name = "status", nullable = false, length = 20,
            columnDefinition = "VARCHAR(20) DEFAULT 'SCHEDULED'")
    @Builder.Default
    private String status = "SCHEDULED";

    @Column(name = "batch_number", length = 100)
    private String batchNumber;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "administered_by")
    private User administeredBy;

    /** Snapshot of administeredBy's display name at record time — survives the user account being edited/removed later. */
    @Column(name = "administered_by_name_snapshot", length = 150)
    private String administeredByNameSnapshot;

    @Column(name = "notes", length = 500)
    private String notes;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Builder.Default
    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
