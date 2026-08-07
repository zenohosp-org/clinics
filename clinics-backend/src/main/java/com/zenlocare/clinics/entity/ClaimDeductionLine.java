package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One line of a settled claim's payer deduction — the WHY behind
 * {@code settledAmount < approvedAmount}, split by {@code disposition} so the
 * shortfall is never miscounted as either collected or lost. Child of
 * {@link InvoiceClaim} via a real FK on {@code claim_id}.
 *
 * <p><b>Append-only, like {@link ClaimEvent}.</b> Rows are only ever INSERTed:
 * there is deliberately no {@code @Setter}, no {@code @PreUpdate}, and no
 * update/delete call anywhere. The one writer is {@code ClaimService}, which
 * writes every line in the SAME transaction as the {@code DEDUCTION_NOTED} event
 * it records — so a rolled-back marking takes its lines with it.
 *
 * <p><b>Classification only — never a charge.</b> These rows re-label a portion
 * of the invoice's <i>already-existing</i> outstanding (total − paid − advance).
 * Writing them must NOT touch the invoice: no disposition — not even
 * RECOVER_FROM_PATIENT — adds a new charge or payment. See Sprint 2b §3.
 *
 * <p>{@code disposition} is one of: WRITE_OFF (the hospital eats it — leakage),
 * APPEAL (contesting the deduction — a holding amount, neither collected nor
 * lost), RECOVER_FROM_PATIENT (re-labelled as patient-due against the existing
 * outstanding).
 */
@Entity
@Table(name = "claim_deduction_lines", indexes = {
    @Index(name = "idx_claim_deduction_lines_claim_id", columnList = "claim_id")
})
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClaimDeductionLine {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Real FK to invoice_claims — ddl-auto emits the constraint from this relation. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "claim_id", nullable = false,
            foreignKey = @ForeignKey(name = "fk_claim_deduction_lines_claim"))
    private InvoiceClaim claim;

    /** WRITE_OFF | APPEAL | RECOVER_FROM_PATIENT */
    @Column(name = "disposition", nullable = false, length = 30)
    private String disposition;

    /** This line's slice of (approvedAmount − settledAmount); all lines sum to the gap. */
    @Column(name = "amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    /** Required line-level reason for this disposition. */
    @Column(name = "reason", columnDefinition = "TEXT", nullable = false)
    private String reason;

    /** The authenticated principal who noted the deduction. Never hardcoded. */
    @Column(name = "actor_user_id")
    private UUID actorUserId;

    /** Denormalised actor label so the marker renders without a user join. */
    @Column(name = "actor_name", length = 150)
    private String actorName;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
