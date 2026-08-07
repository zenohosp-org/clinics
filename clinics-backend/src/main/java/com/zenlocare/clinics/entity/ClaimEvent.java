package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One immutable event in an insurance/TPA claim's history — the audit trail that
 * {@code invoice_claims} alone could never provide (its single {@code notes}
 * column was overwritten on every transition). Child of {@link InvoiceClaim} via
 * a real FK on {@code claim_id}.
 *
 * <p><b>Append-only — this is the whole point of the table.</b> Rows are only
 * ever INSERTed. There is deliberately no {@code @Setter}, no {@code @PreUpdate},
 * and no update/delete call anywhere in the codebase: if any path could mutate or
 * remove a row here, the audit trail would be fiction. The one writer is
 * {@code ClaimService}, which writes every event in the SAME transaction as the
 * status change it records — so a rolled-back transition takes its event with it.
 *
 * <p>{@code event_type} is one of: STATUS_CHANGE (every transition),
 * QUERY_RAISED (payer kicked the claim back for docs/clarification),
 * QUERY_RESPONDED (we resupplied), NOTE (free-text; replaces the legacy
 * overwriting {@code notes} field).
 */
@Entity
@Table(name = "claim_events", indexes = {
    @Index(name = "idx_claim_events_claim_id", columnList = "claim_id"),
    @Index(name = "idx_claim_events_created_at", columnList = "created_at")
})
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClaimEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Real FK to invoice_claims — ddl-auto emits the constraint from this relation. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "claim_id", nullable = false,
            foreignKey = @ForeignKey(name = "fk_claim_events_claim"))
    private InvoiceClaim claim;

    // STATUS_CHANGE | QUERY_RAISED | QUERY_RESPONDED | NOTE
    //  | ENHANCEMENT_REQUESTED | ENHANCEMENT_APPROVED | ENHANCEMENT_DENIED
    //  | DEDUCTION_NOTED (Sprint 2b — payer paid short of approval; see ClaimDeductionLine)
    // (ENHANCEMENT_REQUESTED is 21 chars — keep headroom well above 20.)
    @Column(name = "event_type", nullable = false, length = 40)
    private String eventType;

    /** Free text: query wording, our response, a note, or "FROM → TO" for a status change. */
    @Column(columnDefinition = "TEXT")
    private String body;

    /** The authenticated principal who caused the event. Never hardcoded. */
    @Column(name = "actor_user_id")
    private UUID actorUserId;

    /** Denormalised actor label (email/name) so the thread renders without a user join. */
    @Column(name = "actor_name", length = 150)
    private String actorName;

    /** Optional deadline the payer set on a query (QUERY_RAISED only). */
    @Column(name = "due_date")
    private LocalDate dueDate;

    /**
     * Reserved for Sprint 3 (document upload). The column exists now so the
     * thread schema is stable; there is NO upload logic wired to it yet.
     */
    @Column(name = "attachment_ref", length = 512)
    private String attachmentRef;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
