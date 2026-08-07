package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.Patient;
import com.zenlocare.clinics.entity.PaymentCategory;
import com.zenlocare.clinics.service.PatientService;
import com.zenlocare.clinics.service.PatientAdvanceService;
import com.zenlocare.clinics.service.PatientAdvanceService.PatientAdvanceDTO;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/patients")
@RequiredArgsConstructor
public class PatientController {

    private final PatientService patientService;
    private final PatientAdvanceService patientAdvanceService;

    @GetMapping
    public ResponseEntity<List<Patient>> listPatients(@RequestParam UUID hospitalId) {
        return ResponseEntity.ok(patientService.getPatientsByHospital(hospitalId));
    }

    @GetMapping("/search")
    public ResponseEntity<List<Patient>> searchPatients(
            @RequestParam UUID hospitalId,
            @RequestParam(required = false) String q) {
        return ResponseEntity.ok(patientService.searchPatients(hospitalId, q));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Patient> getPatient(@PathVariable Integer id, @RequestParam UUID hospitalId) {
        return ResponseEntity.ok(patientService.getPatientById(id, hospitalId));
    }

    @GetMapping("/paginated")
    public ResponseEntity<java.util.Map<String, Object>> getPaginated(
            @RequestParam UUID hospitalId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(defaultValue = "") String search
    ) {
        return ResponseEntity.ok(
                patientService.getPaginatedPatients(hospitalId, page, size, search)
        );
    }

    @PostMapping
    public ResponseEntity<Patient> createPatient(@RequestBody CreatePatientRequest req) {
        Patient p = patientService.createPatient(req);
        return ResponseEntity.ok(p);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Patient> updatePatient(@PathVariable Integer id, @RequestBody CreatePatientRequest req) {
        Patient p = patientService.updatePatient(id, req);
        return ResponseEntity.ok(p);
    }

    @GetMapping("/{id}/advances")
    public ResponseEntity<List<PatientAdvanceDTO>> getPatientAdvances(@PathVariable Integer id) {
        return ResponseEntity.ok(
                patientAdvanceService.listByPatient(id)
                        .stream().map(patientAdvanceService::toDTO)
                        .collect(java.util.stream.Collectors.toList())
        );
    }

    @Data
    public static class CreatePatientRequest {
        private UUID hospitalId;
        private String firstName;
        private String lastName;
        private LocalDate dob;
        private String gender;
        private String phone;
        private String email;
        private String bloodGroup;
        private String address;
        private String state;
        private String aadhaarNumber;
        private String maritalStatus;
        private String occupation;
        private String emergencyContactName;
        private String emergencyContactPhone;
        private String emergencyContactRelation;
        private String insuranceScheme;
        private String insurancePolicyNumber;
        private String allergies;
        private String chronicConditions;
        private String referredBy;
        // Financial profile
        private PaymentCategory paymentCategory;
        // Optional registration advance — if provided, creates a PatientAdvance record
        private BigDecimal advanceAmount;
        private String advancePaymentMethod;
        private String advanceNotes;
    }
}
