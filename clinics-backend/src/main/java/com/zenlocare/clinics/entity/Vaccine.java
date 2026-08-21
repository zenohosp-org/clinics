package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Standard immunization schedule catalog — one row per (vaccine, dose).
 * Hospital-agnostic reference data (no hospital_id): every clinic sees the
 * same baseline pediatric schedule. recommendedAgeDays drives due-date
 * calculation off a patient's dob; recommendedAgeLabel is the human-readable
 * form shown in the UI ("6 Weeks", "9 Months").
 */
@Entity
@Table(
    name = "vaccines",
    indexes = {
        @Index(name = "idx_vaccines_age", columnList = "recommended_age_days")
    }
)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Vaccine {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "disease_target", length = 255)
    private String diseaseTarget;

    @Column(name = "dose_number", nullable = false)
    @Builder.Default
    private Integer doseNumber = 1;

    @Column(name = "total_doses")
    private Integer totalDoses;

    /** Human-readable schedule point — "At Birth", "6 Weeks", "9 Months". */
    @Column(name = "recommended_age_label", nullable = false, length = 50)
    private String recommendedAgeLabel;

    /** Days since birth — used to compute each patient's due date and to sort the catalog. */
    @Column(name = "recommended_age_days", nullable = false)
    private Integer recommendedAgeDays;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
