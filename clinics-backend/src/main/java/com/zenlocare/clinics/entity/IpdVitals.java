package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One vitals reading during an IPD admission.  Unlike appointment_vitals
 * (which is a single upsert-keyed row per OPD visit), this table accumulates
 * many rows per admission — one per nursing observation round.
 *
 * hospital_id and patient_id are denormalised from the admission at write
 * time so queries can filter by hospital without joining through admissions.
 * They are derived server-side; the API never trusts them from the client.
 *
 * recordedAt is the clinical time chosen by the nurse (may differ from
 * createdAt if the entry is back-filled after the round).
 */
@Entity
@Table(
    name = "ipd_vitals",
    indexes = @Index(name = "idx_ipd_vitals_admission_time",
                     columnList = "admission_id, recorded_at DESC")
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IpdVitals {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    @Column(name = "admission_id", nullable = false)
    private UUID admissionId;

    // INTEGER — matches admissions.patient_id and patient_records.patient_id,
    // which both FK to patients.patient_id (generated integer identity).
    @Column(name = "patient_id", nullable = false)
    private Integer patientId;

    // Clinical time of the observation — chosen by the nurse, not auto-stamped.
    @Column(name = "recorded_at", nullable = false)
    private LocalDateTime recordedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recorded_by", nullable = false)
    private User recordedBy;

    @Column(name = "bp_systolic")
    private Integer bpSystolic;

    @Column(name = "bp_diastolic")
    private Integer bpDiastolic;

    @Column(name = "heart_rate")
    private Integer heartRate;

    @Column(name = "respiratory_rate")
    private Integer respiratoryRate;

    // Body temperature in °F.  precision=4, scale=1 → values like 98.6, 103.2
    @Column(name = "temperature", precision = 4, scale = 1)
    private BigDecimal temperature;

    // Oxygen saturation %; validated 0–100 server-side
    @Column(name = "spo2")
    private Integer spo2;

    // Numeric pain scale 0–10 (0 = no pain, 10 = worst imaginable)
    @Column(name = "pain_score")
    private Integer painScore;

    // Blood glucose in mg/dL
    @Column(name = "blood_glucose")
    private Integer bloodGlucose;

    @Column(name = "weight_kg", precision = 5, scale = 2)
    private BigDecimal weightKg;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Builder.Default
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @PrePersist
    void onPersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
