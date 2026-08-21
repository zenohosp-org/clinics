package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.Vaccine;
import com.zenlocare.clinics.repository.VaccineRepository;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Read-only window into the standard immunization schedule catalog
 * (hospital-agnostic reference data — see {@link VaccineCatalogSeeder}).
 * Patient-specific timeline entries live under
 * /api/patients/{patientId}/vaccinations ({@link PatientVaccinationController}).
 *
 * GET /api/vaccines/catalog?activeOnly=
 */
@RestController
@RequestMapping("/api/vaccines")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('doctor', 'staff', 'nurse', 'hospital_admin', 'super_admin')")
public class VaccineController {

    private final VaccineRepository vaccineRepository;

    @GetMapping("/catalog")
    public ResponseEntity<List<VaccineDto>> catalog(
            @RequestParam(required = false, defaultValue = "true") boolean activeOnly) {

        List<Vaccine> rows = activeOnly
                ? vaccineRepository.findByIsActiveTrueOrderByRecommendedAgeDaysAscNameAsc()
                : vaccineRepository.findAllByOrderByRecommendedAgeDaysAscNameAsc();

        return ResponseEntity.ok(rows.stream().map(VaccineController::toDto).toList());
    }

    private static VaccineDto toDto(Vaccine v) {
        VaccineDto dto = new VaccineDto();
        dto.setId(v.getId().toString());
        dto.setName(v.getName());
        dto.setDiseaseTarget(v.getDiseaseTarget());
        dto.setDoseNumber(v.getDoseNumber());
        dto.setTotalDoses(v.getTotalDoses());
        dto.setRecommendedAgeLabel(v.getRecommendedAgeLabel());
        dto.setRecommendedAgeDays(v.getRecommendedAgeDays());
        return dto;
    }

    @Data
    public static class VaccineDto {
        private String id;
        private String name;
        private String diseaseTarget;
        private Integer doseNumber;
        private Integer totalDoses;
        private String recommendedAgeLabel;
        private Integer recommendedAgeDays;
    }
}
