package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * A single bag of blood / blood component. The atomic unit a blood bank
 * tracks for inspectors, billing, and clinical use.
 *
 * Lifecycle (status_code references BloodBankLookup with type=UNIT_STATUS):
 *   QUARANTINE  → bag just received, awaiting TTI screening
 *   AVAILABLE   → cleared screening, in stock
 *   RESERVED    → tagged for a specific patient pending crossmatch
 *   ISSUED      → handed over to a ward / OT for transfusion
 *   EXPIRED     → past expiry date; cannot be issued
 *   DISCARDED   → screening fail / leak / temperature breach
 *
 * Source (source_code references BloodBankLookup with type=SOURCE_TYPE):
 *   IN_HOUSE_DONOR     → collected from a registered donor at this hospital
 *   EXTERNAL_PURCHASE  → bought in from another blood bank (donor_id null)
 *
 * Issuance fields (issued_*) are populated when status flips to ISSUED;
 * they're the audit trail for the bag's final destination.
 */
@Entity
@Table(name = "blood_units",
       uniqueConstraints = {
           @UniqueConstraint(name = "uniq_blood_units_bag", columnNames = {"hospital_id", "bag_number"})
       },
       indexes = {
           @Index(name = "idx_blood_units_hospital", columnList = "hospital_id"),
           @Index(name = "idx_blood_units_group", columnList = "blood_group_code"),
           @Index(name = "idx_blood_units_status", columnList = "status_code"),
           @Index(name = "idx_blood_units_expiry", columnList = "expiry_date")
       })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BloodUnit {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    private Hospital hospital;

    @Column(name = "bag_number", nullable = false, length = 60)
    private String bagNumber;

    @Column(name = "blood_group_code", nullable = false, length = 40)
    private String bloodGroupCode;

    @Column(name = "component_code", nullable = false, length = 40)
    private String componentCode;

    @Column(name = "status_code", nullable = false, length = 40)
    @Builder.Default
    private String statusCode = "QUARANTINE";

    @Column(name = "source_code", nullable = false, length = 40)
    @Builder.Default
    private String sourceCode = "IN_HOUSE_DONOR";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "donor_id")
    private BloodDonor donor;

    @Column(name = "volume_ml")
    private Integer volumeMl;

    @Column(name = "collection_date")
    private LocalDate collectionDate;

    /** Auto-computed at registration from component shelf life. */
    @Column(name = "expiry_date", nullable = false)
    private LocalDate expiryDate;

    @Column(name = "storage_location", length = 80)
    private String storageLocation;

    /** Roll-up flag — all five TTI tests negative. Detailed results live
     *  outside this MVP. */
    @Column(name = "screening_passed")
    @Builder.Default
    private Boolean screeningPassed = false;

    @Column(name = "cost_price", precision = 10, scale = 2)
    private BigDecimal costPrice;

    @Column(name = "sale_price", precision = 10, scale = 2)
    private BigDecimal salePrice;

    // ─────── Issuance audit ────────────────────────────────────────────

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issued_to_patient_id")
    private Patient issuedToPatient;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issued_to_admission_id")
    private Admission issuedToAdmission;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issued_by_user_id")
    private User issuedByUser;

    @Column(name = "issued_at")
    private LocalDateTime issuedAt;

    @Column(name = "issued_doctor_name", length = 120)
    private String issuedDoctorName;

    /** Indian-context: relative pledges N donors to replace this bag. */
    @Column(name = "replacements_pledged")
    @Builder.Default
    private Integer replacementsPledged = 0;

    @Column(name = "replacements_received")
    @Builder.Default
    private Integer replacementsReceived = 0;

    @Column(name = "invoice_item_id")
    private UUID invoiceItemId;

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
