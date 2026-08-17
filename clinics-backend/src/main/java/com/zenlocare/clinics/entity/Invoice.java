package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import java.time.LocalDateTime;
import java.util.UUID;
import java.math.BigDecimal;
import java.util.List;

@Entity
@Table(name = "invoices", indexes = {
    @Index(name = "idx_invoices_hospital_id", columnList = "hospital_id"),
    @Index(name = "idx_invoices_patient_id", columnList = "patient_id"),
    @Index(name = "idx_invoices_admission_id", columnList = "admission_id"),
    @Index(name = "idx_invoices_status", columnList = "status_id"),
    @Index(name = "idx_invoices_created_at", columnList = "created_at DESC")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Invoice {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "invoice_number", nullable = false, unique = true)
    private String invoiceNumber;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    @JsonIgnore
    private Hospital hospital;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "patient_id", nullable = false)
    @JsonIgnore
    private Patient patient;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "admission_id")
    @JsonIgnore
    private Admission admission;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "appointment_id")
    @JsonIgnore
    private Appointment appointment;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "specialization_id")
    @JsonIgnore
    private Specialization specialization;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal subtotal;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal tax;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal discount;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal total;

    @Column(name = "payment_method", length = 50)
    private String paymentMethod;

    // Total advance collected and deducted from this bill at finalization
    @Column(name = "advance_adjusted", precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal advanceAdjusted = BigDecimal.ZERO;

    // Running total of payments received (used for PARTIAL payment tracking)
    @Column(name = "paid_amount", precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal paidAmount = BigDecimal.ZERO;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Convert(converter = com.zenlocare.clinics.converter.InvoiceStatusConverter.class)
    @Column(name = "status_id")
    @Builder.Default
    private InvoiceStatus status = InvoiceStatus.UNPAID;

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonManagedReference
    @org.hibernate.annotations.BatchSize(size = 25)
    private List<InvoiceItem> items;

    @Builder.Default
    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    // Optimistic-locking guard: every UPDATE increments this column; concurrent
    // writers see a stale version and Hibernate throws OptimisticLockException.
    // Protects the OPD→IPD promotion and other invoice mutations from races.
    // Nullable for safety while existing rows are backfilled by DataSeeder on startup —
    // Hibernate treats NULL as 0 for the first update.
    @Version
    @Column(name = "version")
    @Builder.Default
    private Long version = 0L;

    /**
     * The patient's name as the bill was issued to them, frozen at creation.
     *
     * <p>Patients legitimately change name — marriage, or a spelling
     * correction. Resolving the name live would mean such a change rewrites
     * the name on every invoice already issued.
     *
     * <p>Write-once, projection-only. Query by {@code patient_id}.
     *
     * <p>This column already exists on the shared `invoices` table — HMS
     * added it (and this same lifecycle hook) after clinics forked from HMS,
     * and clinics never picked up the change. Every invoice insert failed a
     * NOT NULL constraint on this column until this field was added here.
     */
    @Column(name = "patient_name_snapshot", length = 255)
    private String patientNameSnapshot;

    /**
     * Freezes the patient name at insert.
     *
     * <p>Deliberately a lifecycle hook rather than a line in each service:
     * invoices are built in multiple places (InvoiceService, AdmissionService,
     * BloodBankService, ...), and a snapshot any one of them could forget is
     * not a guarantee. JPA gives us the single choke point instead.
     *
     * <p>Only ever sets the value when absent, so it can never overwrite an
     * already-issued name.
     */
    @PrePersist
    public void onCreate() {
        if (this.patientNameSnapshot == null && this.patient != null) {
            String first = this.patient.getFirstName() != null ? this.patient.getFirstName() : "";
            String last = this.patient.getLastName() != null ? " " + this.patient.getLastName() : "";
            String name = (first + last).trim();
            this.patientNameSnapshot = name.isEmpty() ? null : name;
        }
    }

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by_id")
    private User updatedBy;
}
