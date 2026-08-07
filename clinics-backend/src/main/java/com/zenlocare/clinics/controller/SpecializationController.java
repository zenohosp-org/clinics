package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.Specialization;
import com.zenlocare.clinics.service.SpecializationService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/specializations")
@RequiredArgsConstructor
public class SpecializationController {

    private final SpecializationService specializationService;

    @GetMapping
    public ResponseEntity<List<SpecializationDto>> listSpecializations(@RequestParam UUID hospitalId) {
        List<Specialization> specializations = specializationService.getSpecializationsByHospital(hospitalId);
        List<SpecializationDto> dtos = specializations.stream().map(s -> {
            SpecializationDto dto = mapToDto(s);
            dto.setNoOfDoctor(specializationService.getDoctorCount(hospitalId, s.getId()));
            return dto;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(dtos);
    }

    @PostMapping
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<SpecializationDto> createSpecialization(@RequestBody Specialization req) {
        Specialization specialization = specializationService.createSpecialization(req);
        return ResponseEntity.ok(mapToDto(specialization));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<SpecializationDto> updateSpecialization(@PathVariable UUID id, @RequestBody Specialization req) {
        Specialization specialization = specializationService.updateSpecialization(id, req);
        return ResponseEntity.ok(mapToDto(specialization));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<Void> deleteSpecialization(@PathVariable UUID id) {
        specializationService.deleteSpecialization(id);
        return ResponseEntity.noContent().build();
    }

    private SpecializationDto mapToDto(Specialization specialization) {
        SpecializationDto dto = new SpecializationDto();
        dto.setId(specialization.getId());
        dto.setHospitalId(specialization.getHospitalId());
        dto.setName(specialization.getName());
        dto.setDescription(specialization.getDescription());
        dto.setCreatedAt(specialization.getCreatedAt().toString());
        return dto;
    }

    @Data
    public static class SpecializationDto {
        private UUID id;
        private UUID hospitalId;
        private String name;
        private String description;
        private String createdAt;
        private long noOfDoctor;
    }
}
