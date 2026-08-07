package com.zenlocare.clinics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Wire DTOs for the IPD prescription-return flow. Kept in one file because
 * each shape is small, all share the lifecycle, and grouping them prevents
 * the {@code dto/} folder from sprouting six near-empty classes.
 */
public final class PrescriptionReturnDtos {

    private PrescriptionReturnDtos() {}

    /** POST body for the nurse-initiate endpoint. */
    @Data
    public static class InitiateRequest {
        /** When true, the underlying prescription order is also flipped to STOPPED. */
        private boolean stopOrder;
        /** Required when {@code stopOrder} is true. */
        private String stopReason;
        /** Units to return; must be ≥ 1 and ≤ dispensed minus already-returned/held. */
        private Integer returnQty;
        /** Categorical reason. See {@link com.zenlocare.clinics.entity.PrescriptionReturnRequest#getReasonCode()}. */
        private String reasonCode;
        /** Optional free-text context; required server-side when reasonCode = "OTHER". */
        private String reasonNotes;
        /**
         * Optional batch identifier read off the physical strip the nurse is
         * returning. Pharmacy uses it at verify time to credit stock back to
         * the exact batch — bypassing the earliest-dispense heuristic that
         * fails on multi-batch fills. Pharmacy ignores unknown codes and
         * falls back to its default selection, so it's safe to omit.
         */
        private String batchNumber;
        /** Idempotency token; client-generated UUID. Required. */
        private UUID clientRequestId;
        /**
         * Optional replacement drug. When present, the server stops the old
         * order, runs the return, and creates a new ACTIVE prescription on the
         * same admission with {@code replacesPrescriptionItemId} pointing at
         * the old order — all in the same transaction.
         *
         * Restricted to caller roles that may already prescribe (doctor,
         * hospital_admin, super_admin). Nurses get a 403 when this block is
         * non-null; they may still initiate plain returns without it.
         */
        private ReplacementDrug replacement;
    }

    /**
     * Replacement-drug payload — shape mirrors {@code RecordController.PrescriptionItemRequest}
     * so we can hand it straight to {@code RecordService.createRecord} without
     * a translation step. Only the fields nurses might leave blank get sensible
     * server-side defaults.
     */
    @Data
    public static class ReplacementDrug {
        private UUID drugId;
        private String drugName;
        private String drugGeneric;
        private String drugStrength;
        private String drugForm;
        private String dose;
        /** OD | BD | TDS | QID | Q4H | Q6H | Q8H | HS | AC | PC | SOS | STAT */
        private String frequency;
        private Integer durationDays;
        private Integer quantity;
        /** ORAL | IV | IM | SC | TOPICAL | INHALED | OPHTHALMIC | OTIC | NASAL | RECTAL */
        private String route;
        private String instructions;
        private String allergyOverrideReason;
    }

    /** Response after a successful initiate. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class InitiateResponse {
        private UUID returnRequestId;
        private UUID prescriptionItemId;
        private String prescriptionStatus;     // ACTIVE | STOPPED
        private String dispenseStatus;         // PENDING | PARTIAL | DISPENSED
        private Integer dispensedQty;
        private Integer returnedQty;
        private Integer remainingReturnable;   // dispensed - returned - held
        private String requestStatus;          // REQUESTED
        /** Set only when a replacement drug was created. UUID of the new prescription_items row. */
        private UUID replacementPrescriptionItemId;
        /** Display name of the replacement drug — handy for the toast / log line. */
        private String replacementDrugName;
    }

    /** Single row returned to the pharmacy poll. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PendingReturnRequestDto {
        private UUID returnRequestId;
        private UUID prescriptionItemId;
        private UUID admissionId;
        private Integer patientId;
        private String patientName;
        private String drugName;
        private String drugStrength;
        private String drugForm;
        private String dose;
        private Integer returnQty;
        private String reasonCode;
        private String reasonNotes;
        /**
         * Batch code the nurse read off the strip when initiating. Pharmacy
         * uses it at verify time to credit the exact batch and skip the
         * earliest-dispense fallback. Null when the nurse left it blank.
         */
        private String batchNumber;
        private LocalDateTime initiatedAt;
        private String initiatedByName;
        private String initiatedByRole;
        /** Original dispensed total — pharmacist sanity check at the counter. */
        private Integer originalDispensedQty;
    }

    /** Pharmacy → HMS callback to finalize a verified return. */
    @Data
    public static class ConfirmRequest {
        private UUID returnRequestId;
        /**
         * Per-prescription-item qty actually received and verified. We keep this
         * a list so future drug-bundle returns (multiple items in one nurse
         * request) don't need a new endpoint shape — for now there is exactly
         * one line per request and the qty here must equal the request's qty.
         */
        private List<ConfirmLine> lines;
    }

    @Data
    public static class ConfirmLine {
        private UUID prescriptionItemId;
        private Integer qty;
    }

    /** Pharmacy → HMS callback to reject (e.g. physical units never arrived). */
    @Data
    public static class RejectRequest {
        private UUID returnRequestId;
        private String reason;
    }

    /** Generic ack response for confirm / reject. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CallbackResultDto {
        private UUID returnRequestId;
        private String status;                 // VERIFIED | REJECTED
        private UUID prescriptionItemId;
        private Integer returnedQty;
        private String dispenseStatus;
    }
}
