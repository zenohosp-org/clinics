package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import com.fasterxml.jackson.annotation.JsonIgnore;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "patient_advances")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PatientAdvance {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    @JsonIgnore
    private Hospital hospital;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "patient_id", nullable = false)
    @JsonIgnore
    private Patient patient;

    // Nullable — set when patient is admitted; registration advances are auto-linked on admission
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "admission_id")
    @JsonIgnore
    private Admission admission;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal amount;

    @Column(name = "payment_method", length = 50)
    private String paymentMethod;

    @Column(name = "bank_account_id")
    private UUID bankAccountId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private PatientAdvanceSource source = PatientAdvanceSource.REGISTRATION;

    @Column(length = 255)
    private String notes;

    // Auto-generated: ADV-{UHID}-{seq} — unique receipt handed to patient
    @Column(name = "receipt_number", length = 50, unique = true)
    private String receiptNumber;

    // True once this advance has been fully consumed in a finalized bill
    @Builder.Default
    @Column(nullable = false)
    private Boolean applied = false;

    @Column(name = "applied_amount", precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal appliedAmount = BigDecimal.ZERO;

    // Which invoice consumed this advance
    @Column(name = "applied_invoice_id")
    private UUID appliedInvoiceId;

    @Column(name = "collected_by", length = 100)
    private String collectedBy;

    @Column(name = "created_at", updatable = false, nullable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
