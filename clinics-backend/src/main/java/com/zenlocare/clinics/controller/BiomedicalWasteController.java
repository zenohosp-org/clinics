package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.dto.BiomedicalWasteDtos;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.service.BiomedicalWasteService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Bio-medical-waste API — daily category-wise waste logging and
 * handover-to-vendor manifests (BMWM Rules 2016). Tenant scoping is
 * enforced at the service layer via hospitalId from the request.
 */
@RestController
@RequestMapping("/api/biomedical-waste")
@RequiredArgsConstructor
public class BiomedicalWasteController {

    private final BiomedicalWasteService service;

    // ───── Lookups ────────────────────────────────────────────────────

    @GetMapping("/lookups")
    public ResponseEntity<List<BiomedicalWasteDtos.LookupDto>> listLookups(
            @RequestParam UUID hospitalId,
            @RequestParam String type) {
        return ResponseEntity.ok(service.listLookups(hospitalId, type));
    }

    // ───── Logs ───────────────────────────────────────────────────────

    @GetMapping("/logs")
    public ResponseEntity<List<BiomedicalWasteDtos.LogDto>> listLogs(
            @RequestParam UUID hospitalId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String categoryCode,
            @RequestParam(required = false) String generationPointCode,
            @RequestParam(required = false) Boolean pending) {
        return ResponseEntity.ok(service.listLogs(hospitalId, from, to, categoryCode, generationPointCode, pending));
    }

    @PostMapping("/logs")
    public ResponseEntity<BiomedicalWasteDtos.LogDto> createLog(
            @RequestParam UUID hospitalId,
            @RequestBody BiomedicalWasteDtos.LogRequest req,
            Authentication auth) {
        UUID userId = auth != null && auth.getPrincipal() instanceof User u ? u.getId() : null;
        return ResponseEntity.ok(service.createLog(hospitalId, req, userId));
    }

    @PutMapping("/logs/{id}")
    public ResponseEntity<BiomedicalWasteDtos.LogDto> updateLog(
            @PathVariable UUID id,
            @RequestParam UUID hospitalId,
            @RequestBody BiomedicalWasteDtos.LogRequest req) {
        return ResponseEntity.ok(service.updateLog(id, hospitalId, req));
    }

    @DeleteMapping("/logs/{id}")
    public ResponseEntity<Void> deleteLog(
            @PathVariable UUID id,
            @RequestParam UUID hospitalId) {
        service.deleteLog(id, hospitalId);
        return ResponseEntity.noContent().build();
    }

    // ───── Stats ──────────────────────────────────────────────────────

    @GetMapping("/stats")
    public ResponseEntity<BiomedicalWasteDtos.StatsDto> getStats(@RequestParam UUID hospitalId) {
        return ResponseEntity.ok(service.getStats(hospitalId));
    }

    // ───── Handovers ──────────────────────────────────────────────────

    @GetMapping("/handovers")
    public ResponseEntity<List<BiomedicalWasteDtos.HandoverDto>> listHandovers(
            @RequestParam UUID hospitalId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(service.listHandovers(hospitalId, from, to));
    }

    @PostMapping("/handovers")
    public ResponseEntity<BiomedicalWasteDtos.HandoverDto> createHandover(
            @RequestParam UUID hospitalId,
            @RequestBody BiomedicalWasteDtos.HandoverRequest req,
            Authentication auth) {
        UUID userId = auth != null && auth.getPrincipal() instanceof User u ? u.getId() : null;
        return ResponseEntity.ok(service.createHandover(hospitalId, req, userId));
    }

    @GetMapping("/handovers/{id}")
    public ResponseEntity<BiomedicalWasteDtos.HandoverDto> getHandover(
            @PathVariable UUID id,
            @RequestParam UUID hospitalId) {
        return ResponseEntity.ok(service.getHandover(id, hospitalId));
    }
}
