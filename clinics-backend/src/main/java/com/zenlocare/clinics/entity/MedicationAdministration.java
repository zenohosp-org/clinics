package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One entry in the nursing MAR for an IPD admission. Each row records that a
 * nurse either administered, withheld, or was refused a drug from an existing
 * prescription order (PrescriptionItem).
 *
 * status is a three-value discriminator stored as VARCHAR(16):
 *   GIVEN   – nurse administered the dose as ordered
 *   HELD    – nurse withheld the dose (NPO, vitals out of range, pharmacy hold)
 *   REFUSED – patient declined the dose
 * reason is required for HELD and REFUSED; null for GIVEN.
 *
 * hospital_id, admission_id, and patient_id are all derived from the admission
 * at write time. They are never accepted from the request body.
 */
@Entity
@Table(
    name = "medication_administrations",
    indexes = {
        @Index(name = "idx_med_admin_admission", columnList = "admission_id, administered_at DESC"),
        @Index(name = "idx_med_admin_order",     columnList = "order_id")
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MedicationAdministration {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    @Column(name = "admission_id", nullable = false)
    private UUID admissionId;

    /** FK into prescription_items — the order this row fulfils or records a miss against. */
    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Column(name = "patient_id", nullable = false)
    private Integer patientId;

    @Column(name = "administered_at", nullable = false)
    private LocalDateTime administeredAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "administered_by", nullable = false)
    private User administeredBy;

    /**
     * Who physically gave this dose, frozen at write time — a medico-legal
     * fact that must not change if this user is later renamed or leaves.
     * Write-once, projection-only; query by {@code administered_by}.
     *
     * <p>NOT NULL on the shared table (added by HMS after clinics forked);
     * this entity never mapped it, so every dose recorded in clinics was
     * failing this constraint. Same class of bug as invoices.patient_name_snapshot.
     */
    @Column(name = "administered_by_name_snapshot", length = 255)
    private String administeredByNameSnapshot;

    /** GIVEN | HELD | REFUSED — validated in controller before save. */
    @Column(name = "status", nullable = false, length = 16)
    private String status;

    /** Actual dose given if different from prescribed dose; null = same as ordered. */
    @Column(name = "dose_given", length = 100)
    private String doseGiven;

    /** Required when status is HELD or REFUSED; null allowed for GIVEN. */
    @Column(columnDefinition = "TEXT")
    private String reason;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Builder.Default
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
