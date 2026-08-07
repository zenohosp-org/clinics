package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(
    name = "patient_allergies",
    indexes = {
        @Index(name = "idx_patient_allergies_patient", columnList = "patient_id")
    }
)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PatientAllergy {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "patient_id", nullable = false)
    private Integer patientId;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    @Column(name = "allergen", nullable = false, length = 255)
    private String allergen;

    /** Clinical manifestation — "Rash", "Anaphylaxis", "Nausea". Nullable. */
    @Column(name = "reaction", length = 255)
    private String reaction;

    /** MILD | MODERATE | SEVERE | UNKNOWN */
    @Column(name = "severity", nullable = false, length = 20,
            columnDefinition = "VARCHAR(20) DEFAULT 'UNKNOWN'")
    @Builder.Default
    private String severity = "UNKNOWN";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recorded_by")
    private User recordedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
