package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * An insurance/TPA claim raised against a patient invoice. Tracks the full
 * lifecycle: DRAFT → PRE_AUTH (optional) → SUBMITTED → (QUERIED ⇄ SUBMITTED) →
 * APPROVED / PARTIALLY_APPROVED / DENIED → SETTLED. A SUBMITTED claim the payer
 * kicks back for docs becomes QUERIED; responding returns it to SUBMITTED. A
 * DENIED claim may be resubmitted (rework); SETTLED is terminal. Status
 * transitions are enforced in {@code ClaimService} — rows are never hard-deleted,
 * and every transition also appends an immutable {@code claim_events} row.
 */
@Entity
@Table(name = "invoice_claims", indexes = {
    @Index(name = "idx_invoice_claims_hospital_id", columnList = "hospital_id"),
    @Index(name = "idx_invoice_claims_invoice_id", columnList = "invoice_id"),
    @Index(name = "idx_invoice_claims_status", columnList = "status")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InvoiceClaim {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    @Column(name = "invoice_id", nullable = false)
    private UUID invoiceId;

    @Column(name = "payer_id", nullable = false)
    private UUID payerId;

    // DRAFT | PRE_AUTH | SUBMITTED | QUERIED | APPROVED | PARTIALLY_APPROVED
    //  | ENHANCEMENT_REQUESTED | DENIED | SETTLED
    @Column(nullable = false, length = 25)
    @Builder.Default
    private String status = "DRAFT";

    // HOSPITAL | PAYER | NONE — which side the ball is on. Derived in ClaimService
    // from the resulting status on every transition, never entered by the user;
    // this is the single field the worklist sorts and splits on.
    //   DRAFT / PRE_AUTH / QUERIED            → HOSPITAL
    //   SUBMITTED                             → PAYER
    //   APPROVED / PARTIALLY_APPROVED /
    //   DENIED / SETTLED                      → NONE
    @Column(name = "pending_with", length = 10)
    @Builder.Default
    private String pendingWith = "HOSPITAL";

    // When the claim entered its CURRENT pending state — reset to now() on every
    // transition into a non-NONE pending_with, nulled when pending_with = NONE.
    // age_days in the list DTO is derived from this.
    @Column(name = "pending_since")
    private LocalDateTime pendingSince;

    @Column(name = "claimed_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal claimedAmount;

    @Column(name = "approved_amount", precision = 12, scale = 2)
    private BigDecimal approvedAmount;

    // The figure the desk has asked the TPA to raise the approval to, while an
    // enhancement is in flight (status = ENHANCEMENT_REQUESTED). Set on
    // REQUEST_ENHANCEMENT, cleared back to null once the enhancement is approved
    // or denied. Never a patient-money field — it only ever raises approved_amount.
    @Column(name = "requested_amount", precision = 12, scale = 2)
    private BigDecimal requestedAmount;

    @Column(name = "settled_amount", precision = 12, scale = 2)
    private BigDecimal settledAmount;

    @Column(name = "pre_auth_no", length = 50)
    private String preAuthNo;

    @Column(name = "tpa_claim_no", length = 50)
    private String tpaClaimNo;

    @Column(name = "denial_reason", length = 500)
    private String denialReason;

    // LEGACY — read-only as of the claim_events migration. Old rows keep their
    // data; new notes are written as NOTE events, never here. Do not write.
    @Column(length = 1000)
    private String notes;

    @Column(name = "submitted_at")
    private LocalDateTime submittedAt;

    // When the payer decided (approved / partially approved / denied).
    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    @Column(name = "settled_at")
    private LocalDateTime settledAt;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_by_name", length = 150)
    private String createdByName;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    // Optimistic-locking guard, mirroring Invoice: concurrent transitions on the
    // same claim (e.g. approve vs deny) fail fast instead of silently clobbering.
    @Version
    @Column(name = "version")
    @Builder.Default
    private Long version = 0L;

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
