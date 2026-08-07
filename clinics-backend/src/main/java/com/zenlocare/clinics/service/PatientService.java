package com.zenlocare.clinics.service;

import com.zenlocare.clinics.controller.PatientController.CreatePatientRequest;
import com.zenlocare.clinics.entity.Hospital;
import com.zenlocare.clinics.entity.Patient;
import com.zenlocare.clinics.entity.PaymentCategory;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.repository.HospitalRepository;
import com.zenlocare.clinics.repository.PatientRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import java.util.HashMap;
import java.util.Map;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class PatientService {

    private final PatientRepository patientRepository;
    private final HospitalRepository hospitalRepository;
    private final PatientAdvanceService patientAdvanceService;
    private final com.zenlocare.clinics.repository.PatientRecordRepository patientRecordRepository;

    public List<Patient> getPatientsByHospital(UUID hospitalId) {
        return patientRepository.findByHospitalId(hospitalId);
    }

    public List<Patient> searchPatients(UUID hospitalId, String query) {
        if (query == null || query.trim().isEmpty()) {
            return patientRepository.findByHospitalId(hospitalId);
        }

        // Use pagination request to limit to top 20 results for performance
        org.springframework.data.domain.Pageable limit = org.springframework.data.domain.PageRequest.of(0, 20);
        return patientRepository.searchPatients(hospitalId, query.trim(), limit);
    }

    public Patient getPatientById(Integer patientId, UUID hospitalId) {
        return patientRepository.findByIdAndHospitalId(patientId, hospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Patient not found"));
    }

    @Transactional
    public Patient createPatient(CreatePatientRequest req) {
        Hospital hospital = hospitalRepository.findById(req.getHospitalId())
                .orElseThrow(() -> new ResourceNotFoundException("Hospital not found"));

        String uhid = generateUhid(hospital);

        Patient patient = Patient.builder()
                .hospital(hospital)
                .uhid(uhid)
                .firstName(req.getFirstName())
                .lastName(req.getLastName())
                .dob(req.getDob())
                .gender(req.getGender())
                .phone(req.getPhone())
                .email(req.getEmail())
                .bloodGroup(req.getBloodGroup())
                .address(req.getAddress())
                .state(req.getState())
                .aadhaarNumber(req.getAadhaarNumber() != null ? req.getAadhaarNumber().replaceAll("\\D", "") : null)
                .maritalStatus(req.getMaritalStatus())
                .occupation(req.getOccupation())
                .emergencyContactName(req.getEmergencyContactName())
                .emergencyContactPhone(req.getEmergencyContactPhone())
                .emergencyContactRelation(req.getEmergencyContactRelation())
                .insuranceScheme(req.getInsuranceScheme())
                .insurancePolicyNumber(req.getInsurancePolicyNumber())
                .allergies(req.getAllergies())
                .chronicConditions(req.getChronicConditions())
                .referredBy(req.getReferredBy())
                .paymentCategory(req.getPaymentCategory() != null ? req.getPaymentCategory() : PaymentCategory.CASH)
                .build();

        Patient saved = patientRepository.save(patient);

        // If a registration advance was collected, record it now — same transaction
        if (req.getAdvanceAmount() != null && req.getAdvanceAmount().compareTo(BigDecimal.ZERO) > 0) {
            patientAdvanceService.createRegistrationAdvance(
                    saved.getId(), req.getHospitalId(),
                    req.getAdvanceAmount(), req.getAdvancePaymentMethod(), req.getAdvanceNotes());
        }

        return saved;
    }

    private String generateUhid(Hospital hospital) {
        String hospPrefix = HospitalIdPrefix.of(hospital);
        String uhid;
        do {
            long value = 10_000_000_000_000L +
                    ThreadLocalRandom.current().nextLong(90_000_000_000_000L);
            uhid = hospPrefix + value;
        } while (patientRepository.findByHospitalIdAndUhid(hospital.getId(), uhid).isPresent());
        return uhid;
    }

    @Transactional
    public Patient updatePatient(Integer patientId, CreatePatientRequest req) {
        Patient patient = getPatientById(patientId, req.getHospitalId());
        if (req.getFirstName() != null) patient.setFirstName(req.getFirstName());
        if (req.getLastName() != null) patient.setLastName(req.getLastName());
        if (req.getDob() != null) patient.setDob(req.getDob());
        if (req.getGender() != null) patient.setGender(req.getGender());
        if (req.getPhone() != null) patient.setPhone(req.getPhone());
        if (req.getEmail() != null) patient.setEmail(req.getEmail());
        if (req.getBloodGroup() != null) patient.setBloodGroup(req.getBloodGroup());
        if (req.getAddress() != null) patient.setAddress(req.getAddress());
        patient.setState(req.getState());
        patient.setAadhaarNumber(req.getAadhaarNumber() != null ? req.getAadhaarNumber().replaceAll("\\D", "") : null);
        patient.setMaritalStatus(req.getMaritalStatus());
        patient.setOccupation(req.getOccupation());
        patient.setEmergencyContactName(req.getEmergencyContactName());
        patient.setEmergencyContactPhone(req.getEmergencyContactPhone());
        patient.setEmergencyContactRelation(req.getEmergencyContactRelation());
        patient.setInsuranceScheme(req.getInsuranceScheme());
        patient.setInsurancePolicyNumber(req.getInsurancePolicyNumber());
        patient.setAllergies(req.getAllergies());
        patient.setChronicConditions(req.getChronicConditions());
        patient.setReferredBy(req.getReferredBy());
        if (req.getPaymentCategory() != null) patient.setPaymentCategory(req.getPaymentCategory());
        return patientRepository.save(patient);
    }

    public Map<String, Object> getPaginatedPatients(
        UUID hospitalId,
        int page,
        int size,
        String search
    ) {
        Pageable pageable = PageRequest.of(page, size);
        String safeSearch = (search == null) ? "" : search.trim();

        Page<Patient> result = patientRepository.searchByHospital(
            hospitalId, safeSearch, pageable
        );

        List<Integer> patientIds = result.getContent().stream().map(Patient::getId).toList();
        Map<Integer, java.time.LocalDateTime> lastVisitDates = new HashMap<>();
        if (!patientIds.isEmpty()) {
            for (Object[] row : patientRecordRepository.findLastVisitDatesByPatientIds(patientIds)) {
                lastVisitDates.put((Integer) row[0], (java.time.LocalDateTime) row[1]);
            }
        }

        Map<String, Object> response = new HashMap<>();
        response.put("patients", result.getContent());
        response.put("lastVisitDates", lastVisitDates);
        response.put("totalElements", result.getTotalElements());
        response.put("totalPages", result.getTotalPages());
        response.put("currentPage", result.getNumber());

        return response;
    }
}
