package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.dto.ClaimDtos.ClaimEventResponse;
import com.zenlocare.clinics.dto.ClaimDtos.ClaimsSummary;
import com.zenlocare.clinics.dto.ClaimDtos.CreateClaimRequest;
import com.zenlocare.clinics.dto.ClaimDtos.PayerRequest;
import com.zenlocare.clinics.dto.ClaimDtos.TransitionRequest;
import com.zenlocare.clinics.entity.InvoiceClaim;
import com.zenlocare.clinics.entity.Payer;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.security.HospitalAccessGuard;
import com.zenlocare.clinics.service.ClaimService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Insurance/TPA payer master and claims lifecycle. Owned by HMS because the
 * invoices being claimed live here; consumed primarily by the finance app
 * (finance.zenohosp.com) via the user's HMS JWT — same pattern as
 * {@link FinanceReportController}.
 *
 * Multi-tenancy: every endpoint requires {@code hospitalId} and is gated by
 * {@link HospitalAccessGuard}. Writes are additionally role-gated to finance /
 * hospital admins, mirroring the refund endpoint.
 */
@RestController
@RequestMapping("/api/finance")
@RequiredArgsConstructor
public class ClaimController {

    private final ClaimService claimService;
    private final HospitalAccessGuard hospitalAccessGuard;

    // ── Payer master ──

    @GetMapping("/payers")
    public ResponseEntity<List<Payer>> listPayers(
            @RequestParam UUID hospitalId,
            @RequestParam(required = false, defaultValue = "false") boolean includeInactive) {
        hospitalAccessGuard.requireAccess(hospitalId);
        return ResponseEntity.ok(claimService.listPayers(hospitalId, includeInactive));
    }

    @PostMapping("/payers")
    @PreAuthorize("hasAnyRole('finance_admin', 'hospital_admin', 'super_admin')")
    public ResponseEntity<Payer> createPayer(
            @RequestParam UUID hospitalId,
            @RequestBody PayerRequest req) {
        hospitalAccessGuard.requireAccess(hospitalId);
        return ResponseEntity.ok(claimService.createPayer(hospitalId, req));
    }

    @PutMapping("/payers/{payerId}")
    @PreAuthorize("hasAnyRole('finance_admin', 'hospital_admin', 'super_admin')")
    public ResponseEntity<Payer> updatePayer(
            @RequestParam UUID hospitalId,
            @PathVariable UUID payerId,
            @RequestBody PayerRequest req) {
        hospitalAccessGuard.requireAccess(hospitalId);
        return ResponseEntity.ok(claimService.updatePayer(hospitalId, payerId, req));
    }

    // ── Claims ──

    /** Claims list (optionally filtered by status) plus hospital-wide KPI totals. */
    @GetMapping("/claims")
    public ResponseEntity<ClaimsSummary> listClaims(
            @RequestParam UUID hospitalId,
            @RequestParam(required = false, defaultValue = "ALL") String status) {
        hospitalAccessGuard.requireAccess(hospitalId);
        return ResponseEntity.ok(claimService.getSummary(hospitalId, status));
    }

    /** The append-only event thread for one claim (status changes, queries, notes). */
    @GetMapping("/claims/{claimId}/events")
    public ResponseEntity<List<ClaimEventResponse>> listClaimEvents(
            @RequestParam UUID hospitalId,
            @PathVariable UUID claimId) {
        hospitalAccessGuard.requireAccess(hospitalId);
        return ResponseEntity.ok(claimService.listEvents(hospitalId, claimId));
    }

    @PostMapping("/claims")
    @PreAuthorize("hasAnyRole('finance_admin', 'hospital_admin', 'super_admin')")
    public ResponseEntity<InvoiceClaim> createClaim(
            @RequestParam UUID hospitalId,
            @RequestBody CreateClaimRequest req,
            @AuthenticationPrincipal User principal) {
        hospitalAccessGuard.requireAccess(hospitalId);
        return ResponseEntity.ok(claimService.createClaim(hospitalId, req, principal));
    }

    /**
     * Lifecycle action: PRE_AUTH / SUBMIT / APPROVE / DENY / SETTLE. SETTLE also
     * records the settled amount as an Insurance payment on the invoice (atomic;
     * pass recordPayment=false when the payment was already entered manually).
     */
    @PostMapping("/claims/{claimId}/transition")
    @PreAuthorize("hasAnyRole('finance_admin', 'hospital_admin', 'super_admin')")
    public ResponseEntity<InvoiceClaim> transition(
            @RequestParam UUID hospitalId,
            @PathVariable UUID claimId,
            @RequestBody TransitionRequest req,
            @AuthenticationPrincipal User principal) {
        hospitalAccessGuard.requireAccess(hospitalId);
        return ResponseEntity.ok(claimService.transition(hospitalId, claimId, req, principal));
    }
}
