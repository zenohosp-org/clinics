package com.zenlocare.clinics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Wire DTOs for the insurance/TPA claims flow. One file for the same reason as
 * {@link RefundDtos} — small shapes that all serve a single feature.
 */
public final class ClaimDtos {

    private ClaimDtos() {}

    /** POST body to register a payer (TPA / insurer / corporate / scheme). */
    @Data
    public static class PayerRequest {
        /** Required, unique per hospital (case-insensitive). */
        private String name;
        /** TPA | INSURER | CORPORATE | GOVT_SCHEME. Required. */
        private String type;
        private String contactPerson;
        private String phone;
        private String email;
        private String address;
        /** Null = leave unchanged (update) / true (create). */
        private Boolean isActive;
    }

    /** POST body to raise a claim against an invoice. */
    @Data
    public static class CreateClaimRequest {
        private UUID invoiceId;
        private UUID payerId;
        /** Amount claimed from the payer. Required, > 0, ≤ invoice total. */
        private BigDecimal claimedAmount;
        private String preAuthNo;
        private String notes;
    }

    /**
     * POST body for a lifecycle transition. {@code action} is one of:
     * PRE_AUTH (requires preAuthNo), SUBMIT (optional tpaClaimNo),
     * QUERY (requires notes = the query text; optional dueDate),
     * RESPOND (notes = our response; optional),
     * APPROVE (requires approvedAmount), DENY (requires denialReason),
     * REQUEST_ENHANCEMENT (requires requestedAmount, > current approved, ≤ claimed),
     * APPROVE_ENHANCEMENT (requires approvedAmount = granted figure),
     * DENY_ENHANCEMENT (requires denialReason; approved unchanged),
     * SETTLE (settledAmount, defaults to approvedAmount),
     * NOTE_DEDUCTION (requires deductions[] summing exactly to approved − settled;
     *   claim stays SETTLED; classification only, never touches the invoice).
     */
    @Data
    public static class TransitionRequest {
        private String action;
        private BigDecimal approvedAmount;
        /** REQUEST_ENHANCEMENT only: the raised approval the desk is asking the TPA for. */
        private BigDecimal requestedAmount;
        private BigDecimal settledAmount;
        private String denialReason;
        private String tpaClaimNo;
        private String preAuthNo;
        /**
         * Free text. For QUERY it is the payer's query wording (required); for
         * RESPOND it is our response; for any other action it is recorded as a
         * NOTE event. Never written to the legacy claim.notes column.
         */
        private String notes;
        /** QUERY only: optional deadline the payer set for our response. */
        private LocalDate dueDate;
        /** SETTLE only: bank account the payer's money landed in (optional). */
        private UUID bankAccountId;
        /**
         * SETTLE only. True/null (default): atomically record the settled amount
         * as an "Insurance" payment on the invoice. False: skip — for when the
         * payment was already recorded manually via the billing screen, so the
         * money isn't counted twice.
         */
        private Boolean recordPayment;
        /**
         * NOTE_DEDUCTION only: the disposition breakdown of the payer's deduction
         * (approved − settled). Every line carries a disposition, an amount and a
         * reason; the amounts must sum EXACTLY to the deducted amount.
         */
        private List<DeductionLineRequest> deductions;
    }

    /** One line of a NOTE_DEDUCTION marking. */
    @Data
    public static class DeductionLineRequest {
        /** WRITE_OFF | APPEAL | RECOVER_FROM_PATIENT. Required. */
        private String disposition;
        /** This line's slice of the deduction. Required, > 0. */
        private BigDecimal amount;
        /** Required line-level reason for this disposition. */
        private String reason;
    }

    /** One persisted deduction line (read view). */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DeductionLineResponse {
        private UUID id;
        private String disposition;
        private BigDecimal amount;
        private String reason;
        private String actorName;
        private LocalDateTime createdAt;
    }

    /** One claim, enriched with invoice + payer context for list views. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ClaimResponse {
        private UUID id;
        private UUID invoiceId;
        private String invoiceNumber;
        private String patientName;
        private UUID payerId;
        private String payerName;
        private String payerType;
        private String status;
        /** HOSPITAL | PAYER | NONE — the worklist split key. */
        private String pendingWith;
        /**
         * Days since the claim entered its current pending state (server-computed
         * from pendingSince). Null when pendingWith = NONE. Sortable server-side.
         */
        private Long ageDays;
        private BigDecimal claimedAmount;
        private BigDecimal approvedAmount;
        /** In-flight enhancement ask (raise approved to this); null unless ENHANCEMENT_REQUESTED. */
        private BigDecimal requestedAmount;
        private BigDecimal settledAmount;
        private BigDecimal invoiceTotal;
        /** Computed: bill has outgrown approval on an APPROVED/PARTIALLY_APPROVED claim. */
        private boolean needsEnhancement;
        private String preAuthNo;
        private String tpaClaimNo;
        private String denialReason;
        /** Legacy single note (pre-claim_events). New notes live in the events thread. */
        private String notes;
        private LocalDateTime submittedAt;
        private LocalDateTime decidedAt;
        private LocalDateTime settledAt;
        private String createdByName;
        private LocalDateTime createdAt;
        // ── Sprint 2b: payer-deduction classification (SETTLED claims) ──
        /** approved − settled when SETTLED and settled < approved; else null. */
        private BigDecimal deductionTotal;
        private BigDecimal deductionWrittenOff;
        private BigDecimal deductionAppealed;
        private BigDecimal deductionToRecover;
        /** SETTLED with settled < approved but no deduction lines yet — desk still owes a reason. */
        private boolean deductionUnmarked;
        /** The marker lines, if any (oldest first). */
        private List<DeductionLineResponse> deductions;
    }

    /** One row of a claim's append-only event thread (read view). */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ClaimEventResponse {
        private UUID id;
        private UUID claimId;
        /** STATUS_CHANGE | QUERY_RAISED | QUERY_RESPONDED | NOTE */
        private String eventType;
        private String body;
        private String actorName;
        private LocalDate dueDate;
        private LocalDateTime createdAt;
    }

    /** Status-wise counts and amounts for the claims KPI strip. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ClaimsSummary {
        private long openCount;             // DRAFT + PRE_AUTH + SUBMITTED + QUERIED
        private BigDecimal openClaimed;
        private long queriedCount;          // subset of open: ball is with us
        private long waitingOnPayerCount;   // pending_with = PAYER
        private long waitingOnHospitalCount;// pending_with = HOSPITAL
        private long approvedCount;         // APPROVED + PARTIALLY_APPROVED + ENHANCEMENT_REQUESTED
        private BigDecimal approvedAmount;
        private long enhancementRequestedCount; // subset of approved: a raise is in flight with the TPA
        private long needsEnhancementCount;     // approved claims whose bill has outgrown approval
        private long deniedCount;
        private BigDecimal deniedClaimed;
        private long settledCount;
        private BigDecimal settledAmount;
        // ── Sprint 2b: payer-deduction buckets (from claim_deduction_lines) ──
        private BigDecimal deductionWriteOffTotal;  // WRITE_OFF sum — leakage feed
        private BigDecimal deductionAppealTotal;    // APPEAL sum — holding (neither collected nor lost)
        private BigDecimal deductionRecoverTotal;   // RECOVER_FROM_PATIENT sum — re-labelled patient-due
        private long deductionUnmarkedCount;        // SETTLED, settled < approved, no marking yet
        private List<ClaimResponse> claims; // the filtered list backing the view
    }
}
