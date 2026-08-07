package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "discharges")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Discharge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "admission_id", nullable = false, unique = true)
    private Admission admission;

    @Column(name = "actual_discharge_date")
    private LocalDateTime actualDischargeDate;

    @Column(name = "discharge_diagnosis", columnDefinition = "TEXT")
    private String dischargeDiagnosis;

    @Column(name = "discharge_note", columnDefinition = "TEXT")
    private String dischargeNote;

    @Column(name = "follow_up_date")
    private LocalDate followUpDate;

    @Column(name = "follow_up_doctor_id")
    private UUID followUpDoctorId;

    @Column(name = "discharged_by", length = 150)
    private String dischargedBy;

    @Column(name = "discharged_at")
    private LocalDateTime dischargedAt;
}
