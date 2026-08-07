package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.zenlocare.clinics.entity.PaymentCategory;

@Entity
@Table(name = "patients", uniqueConstraints = @UniqueConstraint(columnNames = { "hospital_id", "uhid" }), indexes = {
    @Index(name = "idx_patients_first_name", columnList = "first_name"),
    @Index(name = "idx_patients_last_name", columnList = "last_name"),
    @Index(name = "idx_patients_phone", columnList = "phone")
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Patient {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "patient_id")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    @JsonIgnore
    private Hospital hospital;

    @Column(nullable = false, length = 20)
    private String uhid;

    @Column(name = "first_name", nullable = false, length = 50)
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 50)
    private String lastName;

    @Column(name = "dob")
    private LocalDate dob;

    @Column(nullable = false, length = 10)
    private String gender;

    @Column(length = 20)
    private String phone;

    @Column(length = 100)
    private String email;

    @Column(name = "blood_group", length = 5)
    private String bloodGroup;

    @Column(columnDefinition = "TEXT")
    private String address;

    @Column(name = "state", length = 100)
    private String state;

    @Column(name = "aadhaar_number", length = 12)
    private String aadhaarNumber;

    @Column(name = "marital_status", length = 20)
    private String maritalStatus;

    @Column(length = 100)
    private String occupation;

    @Column(name = "emergency_contact_name", length = 100)
    private String emergencyContactName;

    @Column(name = "emergency_contact_phone", length = 20)
    private String emergencyContactPhone;

    @Column(name = "emergency_contact_relation", length = 50)
    private String emergencyContactRelation;

    @Column(name = "insurance_scheme", length = 50)
    private String insuranceScheme;

    @Column(name = "insurance_policy_number", length = 50)
    private String insurancePolicyNumber;

    @Column(columnDefinition = "TEXT")
    private String allergies;

    @Column(name = "chronic_conditions", columnDefinition = "TEXT")
    private String chronicConditions;

    @Column(name = "referred_by", length = 100)
    private String referredBy;

    // Financial profile — assessed at registration; CASH = needs periodic payment assurance,
    // CREDIT = financially sound, settles at end of treatment
    @Enumerated(EnumType.STRING)
    @Column(name = "payment_category", length = 10)
    @Builder.Default
    private PaymentCategory paymentCategory = PaymentCategory.CASH;

    // Registration is a one-time-per-patient charge. The flag is set the first
    // time a REGISTRATION line lands on any of the patient's invoices (auto
    // flow at appointment-complete/admission, or a staff-built invoice on the
    // billing page). Once true it never resets — surviving invoice deletion or
    // appointment cancellation — so a returning patient never gets re-billed
    // for registration even if their original invoice was wiped.
    // Nullable so Hibernate can ADD the column to existing rows without
    // violating NOT NULL; DataSeeder backfills NULLs to FALSE on startup and
    // marks patients with prior REGISTRATION items TRUE. Callers must treat
    // null as "not paid yet" via Boolean.TRUE.equals(...).
    @Column(name = "registration_fee_paid")
    @Builder.Default
    private Boolean registrationFeePaid = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        normalizeCase();
    }

    @PreUpdate
    protected void onUpdate() {
        normalizeCase();
    }

    private void normalizeCase() {
        if (email != null) {
            this.email = email.toLowerCase().trim();
        }
    }
}
