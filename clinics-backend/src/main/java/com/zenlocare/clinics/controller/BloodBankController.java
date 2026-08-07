package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.dto.BloodBankDtos;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.service.BloodBankService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Blood-bank API. Lookup configuration, donor registry, bag inventory,
 * issuance + stats. Tenant scoping is enforced at the service layer via
 * hospitalId from the request.
 */
@RestController
@RequestMapping("/api/blood-bank")
@RequiredArgsConstructor
public class BloodBankController {

    private final BloodBankService service;

    // ───── Lookups ────────────────────────────────────────────────────

    @GetMapping("/lookups")
    public ResponseEntity<List<BloodBankDtos.LookupDto>> listLookups(
            @RequestParam UUID hospitalId,
            @RequestParam String type) {
        return ResponseEntity.ok(service.listLookups(hospitalId, type));
    }

    // ───── Donors ─────────────────────────────────────────────────────

    @GetMapping("/donors")
    public ResponseEntity<List<BloodBankDtos.DonorDto>> listDonors(@RequestParam UUID hospitalId) {
        return ResponseEntity.ok(service.listDonors(hospitalId));
    }

    @GetMapping("/donors/{id}")
    public ResponseEntity<BloodBankDtos.DonorDto> getDonor(
            @PathVariable UUID id,
            @RequestParam UUID hospitalId) {
        return ResponseEntity.ok(service.getDonor(id, hospitalId));
    }

    @PostMapping("/donors")
    public ResponseEntity<BloodBankDtos.DonorDto> registerDonor(
            @RequestParam UUID hospitalId,
            @RequestBody BloodBankDtos.DonorRequest req) {
        return ResponseEntity.ok(service.registerDonor(hospitalId, req));
    }

    @PutMapping("/donors/{id}")
    public ResponseEntity<BloodBankDtos.DonorDto> updateDonor(
            @PathVariable UUID id,
            @RequestParam UUID hospitalId,
            @RequestBody BloodBankDtos.DonorRequest req) {
        return ResponseEntity.ok(service.updateDonor(id, hospitalId, req));
    }

    // ───── Units (inventory) ──────────────────────────────────────────

    @GetMapping("/units")
    public ResponseEntity<List<BloodBankDtos.UnitDto>> listUnits(
            @RequestParam UUID hospitalId,
            @RequestParam(required = false) String groupCode,
            @RequestParam(required = false) String componentCode,
            @RequestParam(required = false) String statusCode) {
        return ResponseEntity.ok(service.listUnits(hospitalId, groupCode, componentCode, statusCode));
    }

    @GetMapping("/units/{id}")
    public ResponseEntity<BloodBankDtos.UnitDto> getUnit(
            @PathVariable UUID id,
            @RequestParam UUID hospitalId) {
        return ResponseEntity.ok(service.getUnit(id, hospitalId));
    }

    @PostMapping("/units")
    public ResponseEntity<BloodBankDtos.UnitDto> registerUnit(
            @RequestParam UUID hospitalId,
            @RequestBody BloodBankDtos.UnitRequest req) {
        return ResponseEntity.ok(service.registerUnit(hospitalId, req));
    }

    @GetMapping("/units/next-bag-number")
    public ResponseEntity<java.util.Map<String, String>> nextBagNumber(@RequestParam UUID hospitalId) {
        return ResponseEntity.ok(java.util.Map.of("bagNumber", service.generateNextBagNumber(hospitalId)));
    }

    @PatchMapping("/units/{id}/status")
    public ResponseEntity<BloodBankDtos.UnitDto> updateStatus(
            @PathVariable UUID id,
            @RequestParam UUID hospitalId,
            @RequestBody StatusRequest req) {
        return ResponseEntity.ok(service.updateUnitStatus(id, hospitalId, req.getStatusCode()));
    }

    @PatchMapping("/units/{id}/replacements")
    public ResponseEntity<BloodBankDtos.UnitDto> recordReplacement(
            @PathVariable UUID id,
            @RequestParam UUID hospitalId) {
        return ResponseEntity.ok(service.recordReplacement(id, hospitalId));
    }

    @PostMapping("/units/{id}/issue")
    public ResponseEntity<BloodBankDtos.UnitDto> issueUnit(
            @PathVariable UUID id,
            @RequestParam UUID hospitalId,
            @RequestBody BloodBankDtos.IssueUnitRequest req,
            Authentication auth) {
        UUID issuedBy = auth != null && auth.getPrincipal() instanceof User u ? u.getId() : null;
        return ResponseEntity.ok(service.issueUnit(id, hospitalId, req, issuedBy));
    }

    // ───── Stats ──────────────────────────────────────────────────────

    @GetMapping("/stats")
    public ResponseEntity<BloodBankDtos.StatsDto> getStats(@RequestParam UUID hospitalId) {
        return ResponseEntity.ok(service.getStats(hospitalId));
    }

    @lombok.Data
    public static class StatusRequest {
        private String statusCode;
    }
}
