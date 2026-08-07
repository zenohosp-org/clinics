package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.HospitalService;
import com.zenlocare.clinics.service.HospitalServiceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/hospital-services")
@RequiredArgsConstructor
public class HospitalServiceController {

    private final HospitalServiceService service;

    @GetMapping
    public ResponseEntity<List<HospitalService>> listServices(@RequestParam UUID hospitalId) {
        return ResponseEntity.ok(service.getServicesByHospital(hospitalId));
    }

    @PostMapping
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<HospitalService> createService(@RequestBody HospitalService req) {
        return ResponseEntity.ok(service.createService(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<HospitalService> updateService(@PathVariable UUID id, @RequestBody HospitalService req) {
        return ResponseEntity.ok(service.updateService(id, req));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<Void> deleteService(@PathVariable UUID id) {
        service.deleteService(id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/toggle-status")
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<Void> toggleStatus(@PathVariable UUID id) {
        service.toggleStatus(id);
        return ResponseEntity.noContent().build();
    }
}
