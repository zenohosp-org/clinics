package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.dto.BankAccountDTO;
import com.zenlocare.clinics.service.BankAccountService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/bank-accounts")
@RequiredArgsConstructor
public class BankAccountController {

    private final BankAccountService bankAccountService;
    private final com.zenlocare.clinics.security.HospitalAccessGuard hospitalAccessGuard;

    // Managing accounts is an owner-level act — it decides where the clinic's
    // money is recorded. Reading the list stays open to any authenticated user
    // because payment-collection flows need it to populate their dropdown.
    private static final String MANAGE_ROLES =
            "hasAnyRole('SUPER_ADMIN','HOSPITAL_ADMIN')";

    @PostMapping
    @org.springframework.security.access.prepost.PreAuthorize(MANAGE_ROLES)
    public ResponseEntity<BankAccountDTO> create(
            @RequestParam UUID hospitalId,
            @RequestBody BankAccountDTO body) {
        hospitalAccessGuard.requireAccess(hospitalId);
        return ResponseEntity.ok(bankAccountService.create(hospitalId, body));
    }

    @PutMapping("/{id}")
    @org.springframework.security.access.prepost.PreAuthorize(MANAGE_ROLES)
    public ResponseEntity<BankAccountDTO> update(
            @PathVariable UUID id,
            @RequestParam UUID hospitalId,
            @RequestBody BankAccountDTO body) {
        hospitalAccessGuard.requireAccess(hospitalId);
        return ResponseEntity.ok(bankAccountService.update(hospitalId, id, body));
    }

    @DeleteMapping("/{id}")
    @org.springframework.security.access.prepost.PreAuthorize(MANAGE_ROLES)
    public ResponseEntity<Void> delete(
            @PathVariable UUID id,
            @RequestParam UUID hospitalId) {
        hospitalAccessGuard.requireAccess(hospitalId);
        bankAccountService.delete(hospitalId, id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public ResponseEntity<List<BankAccountDTO>> list(
            @RequestParam UUID hospitalId,
            @RequestParam(required = false) String type) {
        hospitalAccessGuard.requireAccess(hospitalId);
        // type accepts a single value or comma-separated list, e.g. "CASH" or "SAVINGS,CURRENT".
        // Omitted or blank → return all accounts for the hospital (backward compatible).
        if (type == null || type.isBlank()) {
            return ResponseEntity.ok(bankAccountService.listByHospital(hospitalId));
        }
        List<String> types = java.util.Arrays.stream(type.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
        return ResponseEntity.ok(bankAccountService.listByHospitalAndTypes(hospitalId, types));
    }
}
