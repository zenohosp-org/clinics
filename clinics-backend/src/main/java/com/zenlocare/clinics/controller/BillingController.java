package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.dto.InvoiceDTO;
import com.zenlocare.clinics.dto.InvoiceRequest;
import com.zenlocare.clinics.dto.SmartBillingSuggestion;
import com.zenlocare.clinics.entity.Invoice;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.service.InvoiceService;
import com.zenlocare.clinics.service.PatientAdvanceService;
import com.zenlocare.clinics.service.PatientAdvanceService.PatientAdvanceDTO;
import com.zenlocare.clinics.service.SmartBillingService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/billing")
@RequiredArgsConstructor
public class BillingController {

    private final SmartBillingService smartBillingService;
    private final InvoiceService invoiceService;
    private final PatientAdvanceService patientAdvanceService;

    @GetMapping("/smart-suggestions")
    public ResponseEntity<SmartBillingSuggestion> getSuggestions(
            @RequestParam Integer patientId,
            @RequestParam(required = false) UUID admissionId) {
        return ResponseEntity.ok(smartBillingService.getSuggestions(patientId, admissionId));
    }

    @GetMapping("/patient/{patientId}/invoices")
    public ResponseEntity<List<InvoiceDTO>> getPatientInvoices(@PathVariable Integer patientId) {
        return ResponseEntity.ok(invoiceService.getPatientInvoices(patientId));
    }

    @PatchMapping("/invoices/{id}/pay")
    public ResponseEntity<Invoice> markAsPaid(
            @PathVariable UUID id,
            @RequestBody(required = false) Map<String, String> body,
            @AuthenticationPrincipal User user) {
        UUID bankAccountId = (body != null && body.get("bankAccountId") != null)
                ? UUID.fromString(body.get("bankAccountId")) : null;
        return ResponseEntity.ok(invoiceService.markAsPaid(id, bankAccountId, user));
    }

    @GetMapping("/admissions/{admissionId}/invoice")
    public ResponseEntity<InvoiceDTO> getAdmissionInvoice(@PathVariable UUID admissionId) {
        return invoiceService.getAdmissionInvoice(admissionId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.noContent().build());
    }

    @PutMapping("/invoices/{id}/finalize")
    public ResponseEntity<InvoiceDTO> finalizeIPDInvoice(
            @PathVariable UUID id, 
            @RequestBody InvoiceRequest req,
            @AuthenticationPrincipal User user) {
        try {
            return ResponseEntity.ok(invoiceService.finalizeIPDInvoice(id, req, user));
        } catch (RuntimeException e) {
            log.error("finalizeIPDInvoice failed for invoiceId={}", id, e);
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/invoices/{id}/detail")
    public ResponseEntity<InvoiceDTO> getInvoiceDetail(@PathVariable UUID id) {
        try {
            return ResponseEntity.ok(invoiceService.getInvoiceDetail(id));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PatchMapping("/invoices/{id}/estimate")
    public ResponseEntity<Void> updateEstimate(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        try {
            BigDecimal total = new BigDecimal(body.getOrDefault("total", "0").toString());
            invoiceService.updateEstimatedTotal(id, total);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            return ResponseEntity.ok().build(); // silent — never block UI
        }
    }

    // ── Advance endpoints ──────────────────────────────────────────────────────

    @GetMapping("/admissions/{admissionId}/advances")
    public ResponseEntity<List<PatientAdvanceDTO>> getAdvancesForAdmission(@PathVariable UUID admissionId) {
        return ResponseEntity.ok(
                patientAdvanceService.listByAdmission(admissionId)
                        .stream().map(patientAdvanceService::toDTO)
                        .collect(java.util.stream.Collectors.toList())
        );
    }

    @PostMapping("/admissions/{admissionId}/advances")
    public ResponseEntity<PatientAdvanceDTO> createAdmissionAdvance(
            @PathVariable UUID admissionId,
            @RequestBody AdvanceRequest req) {
        try {
            return ResponseEntity.ok(patientAdvanceService.toDTO(
                    patientAdvanceService.createAdmissionAdvance(
                            admissionId, req.getAmount(), req.getPaymentMethod(),
                            req.getBankAccountId(), req.getNotes(), req.getCollectedBy())));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @Data
    public static class AdvanceRequest {
        private BigDecimal amount;
        private String paymentMethod;
        private UUID bankAccountId;
        private String notes;
        private String collectedBy;
    }

    @PostMapping("/invoices/{id}/payments")
    public ResponseEntity<InvoiceDTO> collectPayment(
            @PathVariable UUID id,
            @RequestBody PaymentRequest req,
            @AuthenticationPrincipal User user) {
        try {
            return ResponseEntity.ok(invoiceService.collectPayment(
                    id, req.getAmount(), req.getPaymentMethod(),
                    req.getBankAccountId(), req.getCollectedBy(), user));
        } catch (RuntimeException e) {
            log.error("collectPayment failed for invoiceId={}", id, e);
            return ResponseEntity.badRequest().build();
        }
    }

    @Data
    public static class PaymentRequest {
        private BigDecimal amount;
        private String paymentMethod;
        private UUID bankAccountId;
        private String collectedBy;
    }

    @PostMapping("/invoices/{id}/collect")
    public ResponseEntity<InvoiceDTO> collectAndSave(
            @PathVariable UUID id,
            @RequestBody CollectAndSaveRequest req,
            @AuthenticationPrincipal User user) {
        try {
            return ResponseEntity.ok(invoiceService.collectAndSave(
                    id, req,
                    req.getAmount(), req.getPaymentMethod(),
                    req.getBankAccountId(), req.getCollectedBy(), user));
        } catch (RuntimeException e) {
            log.error("collectAndSave failed for invoiceId={}", id, e);
            return ResponseEntity.badRequest().body(
                    InvoiceDTO.builder().notes(e.getMessage()).build());
        }
    }

    @Data
    public static class CollectAndSaveRequest extends InvoiceRequest {
        // paymentMethod and bankAccountId are inherited from InvoiceRequest
        private BigDecimal amount;
        private String collectedBy;
    }

    @PatchMapping("/invoices/{invoiceId}/items/{itemId}/waive")
    public ResponseEntity<InvoiceDTO> waiveItem(
            @PathVariable UUID invoiceId,
            @PathVariable UUID itemId,
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal User user) {
        BigDecimal amount = new BigDecimal(body.getOrDefault("waiverAmount", "0").toString());
        String reason = (String) body.getOrDefault("waiverReason", "");
        try {
            return ResponseEntity.ok(invoiceService.applyWaiver(invoiceId, itemId, amount, reason, user));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().build();
        }
    }
}
