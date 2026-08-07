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

    @GetMapping
    public ResponseEntity<List<BankAccountDTO>> list(
            @RequestParam UUID hospitalId,
            @RequestParam(required = false) String type) {
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
