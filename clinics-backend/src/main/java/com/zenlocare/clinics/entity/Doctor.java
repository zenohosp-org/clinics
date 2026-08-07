package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "doctors")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Doctor {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    private Hospital hospital;

    @Column(name = "specialization_id_1") private UUID specializationId1;
    @Column(name = "specialization_id_2") private UUID specializationId2;
    @Column(name = "specialization_id_3") private UUID specializationId3;
    @Column(name = "specialization_id_4") private UUID specializationId4;
    @Column(name = "specialization_id_5") private UUID specializationId5;
    @Column(name = "specialization_id_6") private UUID specializationId6;

    private String specialization;

    // e.g., MBBS, MD, DNB
    private String qualification;

    @Column(name = "medical_registration_number")
    private String medicalRegistrationNumber;

    // e.g., Tamil Nadu Medical Council
    @Column(name = "registration_council")
    private String registrationCouncil;

    @Column(name = "consultation_fee", precision = 10, scale = 2)
    private BigDecimal consultationFee;

    @Column(name = "follow_up_fee", precision = 10, scale = 2)
    private BigDecimal followUpFee;

    // Bitmask: MON=1,TUE=2,WED=4,THU=8,FRI=16,SAT=32,SUN=64  (Mon–Fri default = 31)
    @Column(name = "available_days_mask")
    @Builder.Default
    private Integer availableDaysMask = 31;

    @Column(name = "slot_duration_min")
    @Builder.Default
    private Integer slotDurationMin = 15;

    @Column(name = "max_daily_slots")
    private Integer maxDailySlots;

    @Column(name = "work_phone", length = 20)
    private String workPhone;

    @Column(name = "personal_phone", length = 20)
    private String personalPhone;

    @Column(name = "work_email")
    private String workEmail;

    @Column(name = "personal_email")
    private String personalEmail;

    @Column(name = "work_address", columnDefinition = "TEXT")
    private String workAddress;

    @Column(name = "residential_address", columnDefinition = "TEXT")
    private String residentialAddress;

    @Builder.Default
    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
