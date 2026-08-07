package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Person registered with the blood bank as a donor. Independent of the
 * patients table because most donors are walk-ins / family members who
 * are NOT registered as patients at this hospital. If a donor is also a
 * patient, link via patient_id (nullable).
 *
 * Blood group + donor type carry string codes that resolve through
 * BloodBankLookup — keeps the configurable list of types in one place.
 */
@Entity
@Table(name = "blood_donors",
       uniqueConstraints = {
           @UniqueConstraint(name = "uniq_blood_donors_code", columnNames = {"hospital_id", "donor_code"})
       },
       indexes = {
           @Index(name = "idx_blood_donors_hospital", columnList = "hospital_id"),
           @Index(name = "idx_blood_donors_phone", columnList = "phone")
       })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BloodDonor {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    private Hospital hospital;

    /** Hospital-scoped human-readable identifier (DON-0001). */
    @Column(name = "donor_code", nullable = false, length = 30)
    private String donorCode;

    @Column(name = "first_name", nullable = false, length = 100)
    private String firstName;

    @Column(name = "last_name", length = 100)
    private String lastName;

    @Column(length = 20)
    private String phone;

    @Column(length = 120)
    private String email;

    private LocalDate dob;

    @Column(length = 10)
    private String gender;

    /** Code into BloodBankLookup (lookup_type=BLOOD_GROUP). */
    @Column(name = "blood_group_code", length = 40)
    private String bloodGroupCode;

    /** Code into BloodBankLookup (lookup_type=DONOR_TYPE). */
    @Column(name = "donor_type_code", length = 40)
    private String donorTypeCode;

    @Column(columnDefinition = "text")
    private String address;

    @Column(name = "aadhaar_number", length = 14)
    private String aadhaarNumber;

    /** Set when the donor also has a record in the patients table. */
    @Column(name = "patient_id")
    private Integer patientId;

    @Column(name = "total_donations")
    @Builder.Default
    private Integer totalDonations = 0;

    @Column(name = "last_donation_date")
    private LocalDate lastDonationDate;

    /** Hard-blocked donors (positive TTI, repeat deferral) stay in the
     *  registry but cannot supply new units. */
    @Column(name = "is_eligible")
    @Builder.Default
    private Boolean isEligible = true;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
