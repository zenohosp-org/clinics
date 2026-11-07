package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.PatientService;
import com.zenlocare.clinics.service.PatientServiceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;
import com.zenlocare.clinics.security.RecordOwnership;

@RestController
@RequestMapping("/api/patient-services")
@RequiredArgsConstructor
public class PatientServiceController {

    private final RecordOwnership ownership;

    private final PatientServiceService service;

    @GetMapping
    public ResponseEntity<List<PatientService>> listServices(@RequestParam UUID hospitalId) {
        return ResponseEntity.ok(service.getServicesByHospital(hospitalId));
    }

    @PostMapping("/save")
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<List<PatientService>> saveServices(@RequestParam UUID hospitalId, @RequestBody List<PatientService> services) {
        service.saveOrUpdateServices(hospitalId, services);
        return ResponseEntity.ok(service.getServicesByHospital(hospitalId));
    }

    @PostMapping
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<PatientService> createService(@RequestBody PatientService req) {
        return ResponseEntity.ok(service.createService(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<PatientService> updateService(@PathVariable UUID id, @RequestBody PatientService req) {
        ownership.require(PatientService.class, id);
        return ResponseEntity.ok(service.updateService(id, req));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<Void> deleteService(@PathVariable UUID id) {
        ownership.require(PatientService.class, id);
        service.deleteService(id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/toggle-status")
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<Void> toggleStatus(@PathVariable UUID id) {
        ownership.require(PatientService.class, id);
        service.toggleStatus(id);
        return ResponseEntity.noContent().build();
    }
}
