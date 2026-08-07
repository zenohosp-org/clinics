package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "invoice_payments")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InvoicePayment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invoice_id", nullable = false)
    private Invoice invoice;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(name = "payment_method", length = 30)
    private String paymentMethod;

    @Column(name = "bank_account_id")
    private UUID bankAccountId;

    @Column(name = "collected_by", length = 100)
    private String collectedBy;

    @Column(length = 255)
    private String notes;

    @CreationTimestamp
    @Column(name = "paid_at", updatable = false)
    private LocalDateTime paidAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "collected_by_id")
    private User collectedByUser;

    /**
     * End-to-end idempotency token, supplied by the finance app when issuing a
     * refund (or any payment write that must be retry-safe). Nullable so the
     * column is purely additive over the existing schema — historical rows and
     * the IPD finalize collect path leave it null. UNIQUE so a retried refund
     * POST returns the original row instead of double-debiting.
     *
     * PostgreSQL allows multiple NULLs under a UNIQUE constraint, so existing
     * rows backfill cleanly when Hibernate adds the column.
     */
    @Column(name = "client_request_id", unique = true)
    private UUID clientRequestId;
}
