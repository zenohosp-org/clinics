package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.Doctor;
import com.zenlocare.clinics.entity.Specialization;
import com.zenlocare.clinics.repository.SpecializationRepository;
import com.zenlocare.clinics.service.DoctorService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import com.zenlocare.clinics.security.ProfileVisibility;

import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/doctors")
@RequiredArgsConstructor
public class DoctorController {

    private final DoctorService doctorService;
    private final SpecializationRepository specializationRepository;

    @GetMapping
    public ResponseEntity<List<DoctorDto>> listDoctors(@RequestParam UUID hospitalId) {
        List<Doctor> doctors = doctorService.getDoctorsByHospital(hospitalId);
        List<DoctorDto> dtos = doctors.stream().map(this::mapToDto).collect(Collectors.toList());
        return ResponseEntity.ok(dtos);
    }

    @GetMapping("/search")
    public ResponseEntity<List<DoctorDto>> searchDoctors(@RequestParam UUID hospitalId, @RequestParam String specialization) {
        List<Doctor> doctors = doctorService.getDoctorsByHospitalAndSpecialization(hospitalId, specialization);
        List<DoctorDto> dtos = doctors.stream().map(this::mapToDto).collect(Collectors.toList());
        return ResponseEntity.ok(dtos);
    }

    @GetMapping("/{id}")
    public ResponseEntity<DoctorDto> getDoctor(@PathVariable UUID id) {
        Doctor doctor = doctorService.getDoctorById(id);
        return ResponseEntity.ok(mapToDto(doctor));
    }

    @GetMapping("/user/{userId}")
    public ResponseEntity<DoctorDto> getDoctorByUserId(@PathVariable UUID userId) {
        Doctor doctor = doctorService.getDoctorByUserId(userId);
        return ResponseEntity.ok(mapToDto(doctor));
    }

    @PostMapping
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<DoctorDto> createDoctor(@RequestBody CreateDoctorRequest req) {
        Doctor doctorData = new Doctor();
        applySpecList(doctorData, req.getSpecializationIds());
        // Store primary spec name for backward compat
        UUID firstId = req.getSpecializationIds() != null && !req.getSpecializationIds().isEmpty()
            ? req.getSpecializationIds().get(0) : null;
        if (firstId != null) {
            specializationRepository.findById(firstId).ifPresent(s -> doctorData.setSpecialization(s.getName()));
        }
        doctorData.setQualification(req.getQualification());
        doctorData.setMedicalRegistrationNumber(req.getMedicalRegistrationNumber());
        doctorData.setRegistrationCouncil(req.getRegistrationCouncil());
        doctorData.setConsultationFee(req.getConsultationFee());
        doctorData.setFollowUpFee(req.getFollowUpFee());
        doctorData.setAvailableDaysMask(req.getAvailableDaysMask() != null ? req.getAvailableDaysMask() : 31);
        doctorData.setSlotDurationMin(req.getSlotDurationMin());
        doctorData.setMaxDailySlots(req.getMaxDailySlots());
        doctorData.setPersonalPhone(req.getPersonalPhone());
        doctorData.setPersonalEmail(req.getPersonalEmail());
        doctorData.setResidentialAddress(req.getResidentialAddress());

        Doctor doctor = doctorService.createDoctor(req.getUserId(), req.getHospitalId(), doctorData);
        return ResponseEntity.ok(mapToDto(doctor));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('hospital_admin') or hasRole('doctor')")
    public ResponseEntity<DoctorDto> updateDoctor(@PathVariable UUID id, @RequestBody DoctorDto req) {
        Doctor updatedData = new Doctor();
        applySpecList(updatedData, req.getSpecializationIds());
        UUID firstId = req.getSpecializationIds() != null && !req.getSpecializationIds().isEmpty()
            ? req.getSpecializationIds().get(0) : null;
        if (firstId != null) {
            specializationRepository.findById(firstId).ifPresent(s -> updatedData.setSpecialization(s.getName()));
        }
        updatedData.setQualification(req.getQualification());
        updatedData.setMedicalRegistrationNumber(req.getMedicalRegistrationNumber());
        updatedData.setRegistrationCouncil(req.getRegistrationCouncil());
        updatedData.setConsultationFee(req.getConsultationFee());
        updatedData.setFollowUpFee(req.getFollowUpFee());
        updatedData.setAvailableDaysMask(req.getAvailableDaysMask() != null ? req.getAvailableDaysMask() : 31);
        updatedData.setSlotDurationMin(req.getSlotDurationMin());
        updatedData.setMaxDailySlots(req.getMaxDailySlots());
        updatedData.setWorkPhone(req.getWorkPhone());
        updatedData.setPersonalPhone(req.getPersonalPhone());
        updatedData.setWorkEmail(req.getWorkEmail());
        updatedData.setPersonalEmail(req.getPersonalEmail());
        updatedData.setWorkAddress(req.getWorkAddress());
        updatedData.setResidentialAddress(req.getResidentialAddress());

        Doctor doctor = doctorService.updateDoctor(id, updatedData);
        return ResponseEntity.ok(mapToDto(doctor));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<Void> deleteDoctor(@PathVariable UUID id) {
        doctorService.deleteDoctor(id);
        return ResponseEntity.noContent().build();
    }

    private DoctorDto mapToDto(Doctor doctor) {
        DoctorDto dto = new DoctorDto();
        dto.setId(doctor.getId().toString());
        dto.setUserId(doctor.getUser().getId().toString());
        dto.setHospitalId(doctor.getHospital().getId().toString());

        // Same rule as the staff directory — a doctor's login email and personal
        // phone are theirs, not the whole hospital's. The work* fields below stay
        // visible: that's what they're for.
        boolean privileged = ProfileVisibility.maySeePrivateFieldsOf(doctor.getUser().getId());

        dto.setFirstName(doctor.getUser().getFirstName());
        dto.setLastName(doctor.getUser().getLastName());
        dto.setEmail(privileged ? doctor.getUser().getEmail() : null);
        dto.setPhone(privileged ? doctor.getUser().getPhone() : null);
        dto.setUserIsActive(doctor.getUser().getIsActive());

        dto.setSpecializationIds(toSpecList(doctor));
        dto.setSpecialization(doctor.getSpecialization());
        dto.setQualification(doctor.getQualification());
        dto.setMedicalRegistrationNumber(doctor.getMedicalRegistrationNumber());
        dto.setRegistrationCouncil(doctor.getRegistrationCouncil());
        dto.setConsultationFee(doctor.getConsultationFee());
        dto.setFollowUpFee(doctor.getFollowUpFee());
        dto.setAvailableDaysMask(doctor.getAvailableDaysMask() != null ? doctor.getAvailableDaysMask() : 31);
        dto.setSlotDurationMin(doctor.getSlotDurationMin());
        dto.setMaxDailySlots(doctor.getMaxDailySlots());
        dto.setWorkPhone(doctor.getWorkPhone());
        dto.setWorkEmail(doctor.getWorkEmail());
        dto.setWorkAddress(doctor.getWorkAddress());
        dto.setPersonalPhone(privileged ? doctor.getPersonalPhone() : null);
        dto.setPersonalEmail(privileged ? doctor.getPersonalEmail() : null);
        dto.setResidentialAddress(privileged ? doctor.getResidentialAddress() : null);

        return dto;
    }

    private List<UUID> toSpecList(Doctor d) {
        List<UUID> ids = new ArrayList<>();
        if (d.getSpecializationId1() != null) ids.add(d.getSpecializationId1());
        if (d.getSpecializationId2() != null) ids.add(d.getSpecializationId2());
        if (d.getSpecializationId3() != null) ids.add(d.getSpecializationId3());
        if (d.getSpecializationId4() != null) ids.add(d.getSpecializationId4());
        if (d.getSpecializationId5() != null) ids.add(d.getSpecializationId5());
        if (d.getSpecializationId6() != null) ids.add(d.getSpecializationId6());
        return ids;
    }

    private void applySpecList(Doctor target, List<UUID> ids) {
        List<UUID> safe = ids == null ? List.of()
            : ids.stream().filter(Objects::nonNull).distinct().limit(6).collect(Collectors.toList());
        target.setSpecializationId1(safe.size() > 0 ? safe.get(0) : null);
        target.setSpecializationId2(safe.size() > 1 ? safe.get(1) : null);
        target.setSpecializationId3(safe.size() > 2 ? safe.get(2) : null);
        target.setSpecializationId4(safe.size() > 3 ? safe.get(3) : null);
        target.setSpecializationId5(safe.size() > 4 ? safe.get(4) : null);
        target.setSpecializationId6(safe.size() > 5 ? safe.get(5) : null);
    }

    @Data
    public static class CreateDoctorRequest {
        private UUID userId;
        private UUID hospitalId;
        private List<UUID> specializationIds;
        private String qualification;
        private String medicalRegistrationNumber;
        private String registrationCouncil;
        private BigDecimal consultationFee;
        private BigDecimal followUpFee;
        private Integer availableDaysMask;  // bitmask: MON=1,TUE=2,WED=4,THU=8,FRI=16,SAT=32,SUN=64
        private Integer slotDurationMin;
        private Integer maxDailySlots;
        private String personalPhone;
        private String personalEmail;
        private String residentialAddress;
    }

    @Data
    public static class DoctorDto {
        private String id;
        private String userId;
        private String hospitalId;

        private String firstName;
        private String lastName;
        private String email;
        private String phone;
        private Boolean userIsActive;

        private List<UUID> specializationIds;
        private String specialization;
        private String qualification;
        private String medicalRegistrationNumber;
        private String registrationCouncil;
        private BigDecimal consultationFee;
        private BigDecimal followUpFee;
        private Integer availableDaysMask;  // bitmask: MON=1,TUE=2,WED=4,THU=8,FRI=16,SAT=32,SUN=64
        private Integer slotDurationMin;
        private Integer maxDailySlots;
        private String workPhone;
        private String personalPhone;
        private String workEmail;
        private String personalEmail;
        private String workAddress;
        private String residentialAddress;
    }
}
