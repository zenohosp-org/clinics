package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One fluid intake or output entry during an IPD admission.
 *
 * entry_type: INTAKE | OUTPUT
 * category (intake):  IV_FLUID | ORAL | BLOOD | MEDICATION | OTHER_INTAKE
 * category (output):  URINE | DRAIN | VOMIT | STOOL | BLOOD_LOSS | OTHER_OUTPUT
 *
 * entry_time is the clinical time chosen by the recorder (may differ from
 * created_at if back-filled after the observation).
 */
@Entity
@Table(
    name = "fluid_entries",
    indexes = @Index(name = "idx_fluid_entries_admission",
                     columnList = "admission_id, entry_time DESC")
)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class FluidEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "admission_id", nullable = false)
    private UUID admissionId;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    /** INTAKE or OUTPUT */
    @Column(name = "entry_type", nullable = false, length = 10)
    private String entryType;

    /** Fine-grained category — validated server-side against allowed sets */
    @Column(name = "category", nullable = false, length = 30)
    private String category;

    /** Volume in millilitres — must be > 0 */
    @Column(name = "volume_ml", nullable = false)
    private Integer volumeMl;

    @Column(name = "notes", length = 255)
    private String notes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recorded_by")
    private User recordedBy;

    /** Clinical time of the measurement — chosen by the nurse */
    @Column(name = "entry_time", nullable = false)
    @Builder.Default
    private LocalDateTime entryTime = LocalDateTime.now();

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
