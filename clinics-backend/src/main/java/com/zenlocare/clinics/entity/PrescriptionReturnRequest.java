package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Nurse-initiated request to return unused units of a dispensed drug from the
 * ward to pharmacy. Pharmacy polls REQUESTED rows, the pharmacist verifies the
 * physical units at the counter, and pharmacy calls back to mark the request
 * VERIFIED — at which point the IPD invoice picks up a HMS_CREDIT_NOTE
 * pharmacy_bill on next finalize and the stock is re-credited.
 *
 * Why this row exists rather than just bumping {@code prescription_items.returned_qty}:
 *  - Pharmacy needs a stable poll target (mirrors the existing pending-prescription poll).
 *  - The audit trail (who, when, why, who verified, who rejected) must survive
 *    independently of the prescription row.
 *  - {@code client_request_id} provides end-to-end idempotency from the nurse's
 *    client so a retried POST doesn't double-return.
 */
@Entity
@Table(name = "prescription_return_requests",
        indexes = {
            @Index(name = "idx_pr_req_hospital_status_ts",
                    columnList = "hospital_id, status, created_at DESC"),
            @Index(name = "idx_pr_req_prescription_item",
                    columnList = "prescription_item_id"),
            @Index(name = "idx_pr_req_admission",
                    columnList = "admission_id")
        },
        uniqueConstraints = {
            @UniqueConstraint(name = "uq_pr_req_client_request_id",
                    columnNames = "client_request_id")
        })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PrescriptionReturnRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "hospital_id", nullable = false)
    private Hospital hospital;

    /** The drug order this return is against. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "prescription_item_id", nullable = false)
    private PrescriptionItem prescriptionItem;

    /** The IPD admission this return is from — duplicated for fast filtering. */
    @Column(name = "admission_id", nullable = false)
    private UUID admissionId;

    /**
     * The nurse (or doctor) who initiated the return. We persist a hard FK so
     * the queue can show "initiated by" without joining through the audit log.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "initiated_by_user_id", nullable = false)
    private User initiatedByUser;

    /** Number of units the nurse is asking pharmacy to take back. */
    @Column(name = "return_qty", nullable = false)
    private Integer returnQty;

    /**
     * Categorical reason — drives downstream put-to (STOCK vs QUARANTINE) on
     * pharmacy side and the wording of the credit-note. Free-text varchar so
     * we can grow the taxonomy without a DB enum migration.
     *
     * Common values: INEFFECTIVE, ADVERSE_REACTION, DOSE_CHANGE, ORDER_STOPPED,
     * WRONG_DRUG_DISPENSED, EXPIRY_NEAR, WASTAGE_BROKEN, WASTAGE_SPILLED, OTHER.
     */
    @Column(name = "reason_code", nullable = false, length = 40)
    private String reasonCode;

    /** Free-text clinical context — required for OTHER, optional otherwise. */
    @Column(name = "reason_notes", columnDefinition = "TEXT")
    private String reasonNotes;

    /**
     * Optional batch identifier read off the physical strip the nurse is
     * returning. Pharmacy uses it at verify time to credit stock back to the
     * exact batch the dispense came from — bypassing the earliest-dispense
     * heuristic that fails on multi-batch fills.
     *
     * Free-text (not a FK) because:
     *  - HMS doesn't own the pharmacy stock-batch table; cross-service FKs
     *    would couple the deployments.
     *  - Nurses scan or type from the strip label, which is a human-readable
     *    batch code anyway.
     *  - Pharmacy resolves the code → batch_id on its side at verify time
     *    and can fall back to the earliest dispense if the code is unknown.
     *
     * Nullable: single-dispense returns don't need to specify it.
     */
    @Column(name = "batch_number", length = 60)
    private String batchNumber;

    /**
     * Lifecycle: REQUESTED → (VERIFIED | REJECTED). CANCELLED is reserved for
     * a future "nurse-side cancel before pharmacy picks it up" flow; currently
     * unused but accepted so a rollback path exists if we add it.
     */
    @Column(nullable = false, length = 20,
            columnDefinition = "VARCHAR(20) DEFAULT 'REQUESTED'")
    @Builder.Default
    private String status = "REQUESTED";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "verified_by_user_id")
    private User verifiedByUser;

    @Column(name = "verified_at")
    private LocalDateTime verifiedAt;

    @Column(name = "rejected_reason", columnDefinition = "TEXT")
    private String rejectedReason;

    /**
     * End-to-end idempotency token generated by the client. We enforce UNIQUE
     * so a retried POST returns the original row instead of creating a duplicate.
     */
    @Column(name = "client_request_id", nullable = false)
    private UUID clientRequestId;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
