package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.dto.DoctorCollectionsDailyResponse;
import com.zenlocare.clinics.dto.DoctorCollectionsSummaryResponse;
import com.zenlocare.clinics.dto.RefundDtos;
import com.zenlocare.clinics.entity.Invoice;
import com.zenlocare.clinics.entity.InvoicePayment;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.repository.InvoiceRepository;
import com.zenlocare.clinics.security.HospitalAccessGuard;
import com.zenlocare.clinics.service.FinanceReportService;
import com.zenlocare.clinics.service.InvoiceService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Finance-side reporting endpoints. Owned by HMS because the source of truth
 * for invoice payments, appointments, and admissions lives here. Consumed by
 * the finance app (api-finance.zenohosp.com) via the user's HMS JWT.
 *
 * Multi-tenancy: every endpoint requires {@code hospitalId} and is gated by
 * {@link HospitalAccessGuard} — the caller must belong to the queried hospital
 * (super_admin bypasses). The path is left under {@code /api} (not
 * {@code /api/admin}) so non-admin finance staff with appropriate access can
 * read it; tighten with {@code @PreAuthorize} if finance demands role gating.
 */
@RestController
@RequestMapping("/api/finance")
@RequiredArgsConstructor
public class FinanceReportController {

    private final FinanceReportService financeReportService;
    private final HospitalAccessGuard hospitalAccessGuard;
    private final InvoiceService invoiceService;
    private final InvoiceRepository invoiceRepository;

    /**
     * Per-doctor collected-fees summary for three windows:
     *   - today (asOf)
     *   - last 7 days (asOf − 6 ... asOf, inclusive)
     *   - this month (1st of asOf's month ... asOf, inclusive)
     *
     * All windows are aligned to Asia/Kolkata, regardless of server TZ.
     *
     * @param hospitalId required; must match caller's hospital (super_admin bypasses)
     * @param asOf       optional; defaults to today in IST. Useful for back-dated reports.
     */
    @GetMapping("/doctor-collections/summary")
    public ResponseEntity<DoctorCollectionsSummaryResponse> getDoctorCollectionsSummary(
            @RequestParam UUID hospitalId,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf) {
        hospitalAccessGuard.requireAccess(hospitalId);
        return ResponseEntity.ok(financeReportService.getSummary(hospitalId, asOf));
    }

    /**
     * Per-doctor, per-day collected-fees breakdown over a closed date range.
     * Range is capped at 93 days. Days with no collections are returned as 0
     * so the caller can chart a continuous series.
     */
    @GetMapping("/doctor-collections/daily")
    public ResponseEntity<DoctorCollectionsDailyResponse> getDoctorCollectionsDaily(
            @RequestParam UUID hospitalId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        hospitalAccessGuard.requireAccess(hospitalId);
        return ResponseEntity.ok(financeReportService.getDaily(hospitalId, from, to));
    }

    /**
     * Invoices where the patient has overpaid (typically because a ward-return
     * credit-note landed after the bill was settled). Drives the finance app's
     * "Pending Refunds" page.
     */
    @GetMapping("/pending-refunds")
    public ResponseEntity<RefundDtos.PendingRefundsResponse> getPendingRefunds(
            @RequestParam UUID hospitalId) {
        hospitalAccessGuard.requireAccess(hospitalId);
        return ResponseEntity.ok(financeReportService.getPendingRefunds(hospitalId));
    }

    /**
     * Refunds issued in a window — drives the finance app's "Refund History"
     * audit page. Source is negative-amount {@code invoice_payment} rows.
     *
     * Defaults to the last 7 days when no range is supplied. Hard-capped at
     * 93 days to mirror the doctor-collections daily endpoint.
     */
    @GetMapping("/refunds")
    public ResponseEntity<RefundDtos.RefundHistoryResponse> getRefundHistory(
            @RequestParam UUID hospitalId,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        hospitalAccessGuard.requireAccess(hospitalId);
        return ResponseEntity.ok(financeReportService.getRefundHistory(hospitalId, from, to));
    }

    /**
     * Return-credits feed — every credit-note line written to this hospital's
     * invoices in a window. Source is negative-priced {@code invoice_items}
     * with a non-null {@code pharmacy_bill_id} (i.e. pharmacy-sourced from a
     * ward return that arrived via IPD Finalize). Includes credits that
     * never triggered a refund (i.e. applied before the patient paid), so
     * finance sees the full picture rather than just the refund consequences.
     *
     * Same access-control + window model as {@code /refunds} and
     * {@code /pending-refunds}: HospitalAccessGuard, default last-7-days,
     * 93-day cap.
     */
    @GetMapping("/returns")
    public ResponseEntity<RefundDtos.ReturnCreditsResponse> getReturnCredits(
            @RequestParam UUID hospitalId,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        hospitalAccessGuard.requireAccess(hospitalId);
        return ResponseEntity.ok(financeReportService.getReturnCredits(hospitalId, from, to));
    }

    /**
     * Issue a refund against an overpaid invoice. Writes a negative
     * {@code invoice_payment} row and (for non-cash) debits the bank account
     * via the existing bank-ledger service. End-to-end idempotent on
     * {@code clientRequestId} — a retried POST returns the original refund.
     *
     * Role-gated: only finance / admin roles can move money. Hospital scoping
     * goes through the invoice → hospital lookup before {@link HospitalAccessGuard}
     * rejects cross-tenant access.
     */
    @PostMapping("/invoices/{invoiceId}/refund")
    @PreAuthorize("hasAnyRole('finance_admin', 'hospital_admin', 'super_admin')")
    public ResponseEntity<RefundDtos.IssueRefundResponse> issueRefund(
            @PathVariable UUID invoiceId,
            @RequestBody RefundDtos.IssueRefundRequest req,
            @AuthenticationPrincipal User principal) {

        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new IllegalArgumentException("Invoice not found"));
        UUID invoiceHospitalId = invoice.getHospital() != null ? invoice.getHospital().getId() : null;
        hospitalAccessGuard.requireAccess(invoiceHospitalId);

        InvoicePayment refund = invoiceService.issueRefund(
                invoiceId,
                req.getClientRequestId(),
                req.getAmount(),
                req.getPaymentMethod(),
                req.getBankAccountId(),
                req.getNotes(),
                principal);

        // Re-fetch so newPaidAmount / newRefundable reflect the post-refund state.
        // The earlier `invoice` reference is a pre-call snapshot — using it here
        // would return stale values on the first call (a replay would still be
        // correct because the existing-row branch in the service no-ops).
        Invoice fresh = invoiceRepository.findById(invoiceId).orElse(invoice);
        BigDecimal newPaid = fresh.getPaidAmount() != null ? fresh.getPaidAmount() : BigDecimal.ZERO;
        BigDecimal total   = fresh.getTotal()      != null ? fresh.getTotal()      : BigDecimal.ZERO;
        BigDecimal remaining = newPaid.subtract(total);
        if (remaining.signum() < 0) remaining = BigDecimal.ZERO;

        return ResponseEntity.ok(RefundDtos.IssueRefundResponse.builder()
                .paymentId(refund.getId())
                .invoiceId(invoiceId)
                .invoiceNumber(fresh.getInvoiceNumber())
                .refundedAmount(req.getAmount())
                .newPaidAmount(newPaid)
                .newRefundable(remaining)
                .refundedAt(refund.getPaidAt())
                .build());
    }
}
