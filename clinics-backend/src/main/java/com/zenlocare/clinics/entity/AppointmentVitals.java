package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Per-visit vital signs recorded by the nurse before the doctor starts the
 * consultation. One row per appointment (appointment_id is UNIQUE); the
 * nurse upserts as they re-take readings, so the latest set always wins.
 *
 * Vitals that genuinely change visit-to-visit (BP, SpO2, HR, weight) live
 * here. Static patient attributes (blood group, allergies) stay on the
 * patient registration record and are read-through at display time.
 *
 * Columns are individually typed (integers for percentages and bpm,
 * decimal for weight) rather than a JSON blob so they're trendable and
 * threshold-alertable downstream without parsing.
 */
@Entity
@Table(name = "appointment_vitals",
        uniqueConstraints = @UniqueConstraint(columnNames = "appointment_id"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AppointmentVitals {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "appointment_id", nullable = false, unique = true)
    private UUID appointmentId;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    @Column(name = "patient_id", nullable = false)
    private Integer patientId;

    // Blood pressure split into systolic + diastolic so each can be charted
    // and alerted on independently. Standard mmHg, integer precision.
    @Column(name = "bp_systolic")
    private Integer bpSystolic;

    @Column(name = "bp_diastolic")
    private Integer bpDiastolic;

    // Oxygen saturation as integer percent (0–100).
    @Column(name = "spo2")
    private Integer spo2;

    // Heart rate in beats per minute.
    @Column(name = "heart_rate")
    private Integer heartRate;

    // Body weight in kilograms. precision 5/scale 2 → up to 999.99 kg
    // covers any realistic patient with two-decimal resolution.
    @Column(name = "weight_kg", precision = 5, scale = 2)
    private BigDecimal weightKg;

    @Column(name = "height_cm")
    private Integer heightCm;

    @Column(name = "blood_glucose")
    private Integer bloodGlucose;


    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recorded_by", nullable = false)
    private User recordedBy;

    @Builder.Default
    @Column(name = "recorded_at", nullable = false, updatable = false)
    private LocalDateTime recordedAt = LocalDateTime.now();

    @Builder.Default
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
