package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * A referral placed during an IPD admission.
 *
 * referred_to_type: INTERNAL | EXTERNAL
 * priority:         ROUTINE | URGENT | EMERGENCY
 * status:           PENDING → ACCEPTED → COMPLETED | CANCELLED
 *
 * referred_to_name is free text — specialty ("Cardiology"), department
 * ("ICU"), or an external hospital name depending on type.
 */
@Entity
@Table(
    name = "patient_referrals",
    indexes = @Index(name = "idx_patient_referrals_admission",
                     columnList = "admission_id, created_at DESC")
)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PatientReferral {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "admission_id", nullable = false)
    private UUID admissionId;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    /** Specialty / department / external hospital name */
    @Column(name = "referred_to_name", nullable = false, length = 255)
    private String referredToName;

    /** INTERNAL | EXTERNAL */
    @Column(name = "referred_to_type", nullable = false, length = 10)
    @Builder.Default
    private String referredToType = "INTERNAL";

    @Column(name = "reason", nullable = false, columnDefinition = "TEXT")
    private String reason;

    /** ROUTINE | URGENT | EMERGENCY */
    @Column(name = "priority", nullable = false, length = 12)
    @Builder.Default
    private String priority = "ROUTINE";

    /** PENDING | ACCEPTED | COMPLETED | CANCELLED */
    @Column(name = "status", nullable = false, length = 12)
    @Builder.Default
    private String status = "PENDING";

    /** Outcome notes or response from the receiving specialist */
    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "referred_by")
    private User referredBy;

    /** Free text — receiving doctor/consultant name when accepted */
    @Column(name = "accepted_by_name", length = 255)
    private String acceptedByName;

    @Column(name = "accepted_at")
    private LocalDateTime acceptedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "responded_by")
    private User respondedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
