package com.zenlocare.clinics.config;

import com.zenlocare.clinics.entity.Vaccine;
import com.zenlocare.clinics.repository.VaccineRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * One-time seed of the standard pediatric immunization schedule (India NIS /
 * IAP, birth through 2 years) into the hospital-agnostic `vaccines` catalog.
 *
 * Pure INSERT via JPA — no DDL, so this is safe to run from clinics-backend
 * even though HMS owns schema changes for the shared database (see
 * DEPLOYMENT.md). Idempotent: skips entirely once any row exists, so it never
 * duplicates or overwrites a hospital admin's later edits to the catalog.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class VaccineCatalogSeeder implements CommandLineRunner {

    private final VaccineRepository vaccineRepository;

    @Override
    public void run(String... args) {
        if (vaccineRepository.count() > 0) {
            return;
        }
        log.info("Seeding standard pediatric immunization schedule into vaccines catalog");
        vaccineRepository.saveAll(List.of(
                dose("BCG", "Tuberculosis", 1, 1, "At Birth", 0),
                dose("Hepatitis B", "Hepatitis B", 1, 4, "At Birth", 0),
                dose("OPV", "Poliomyelitis", 1, 5, "At Birth", 0),

                dose("OPV", "Poliomyelitis", 2, 5, "6 Weeks", 42),
                dose("Pentavalent (DTwP-HepB-Hib)", "Diphtheria, Pertussis, Tetanus, Hepatitis B, Hib", 1, 3, "6 Weeks", 42),
                dose("Rotavirus", "Rotavirus diarrhea", 1, 3, "6 Weeks", 42),
                dose("PCV", "Pneumococcal disease", 1, 3, "6 Weeks", 42),
                dose("IPV", "Poliomyelitis", 1, 2, "6 Weeks", 42),

                dose("OPV", "Poliomyelitis", 3, 5, "10 Weeks", 70),
                dose("Pentavalent (DTwP-HepB-Hib)", "Diphtheria, Pertussis, Tetanus, Hepatitis B, Hib", 2, 3, "10 Weeks", 70),
                dose("Rotavirus", "Rotavirus diarrhea", 2, 3, "10 Weeks", 70),

                dose("OPV", "Poliomyelitis", 4, 5, "14 Weeks", 98),
                dose("Pentavalent (DTwP-HepB-Hib)", "Diphtheria, Pertussis, Tetanus, Hepatitis B, Hib", 3, 3, "14 Weeks", 98),
                dose("Rotavirus", "Rotavirus diarrhea", 3, 3, "14 Weeks", 98),
                dose("PCV", "Pneumococcal disease", 2, 3, "14 Weeks", 98),
                dose("IPV", "Poliomyelitis", 2, 2, "14 Weeks", 98),

                dose("Measles-Mumps-Rubella (MMR)", "Measles, Mumps, Rubella", 1, 2, "9 Months", 270),
                dose("Vitamin A", "Vitamin A deficiency", 1, 9, "9 Months", 270),
                dose("PCV Booster", "Pneumococcal disease", 3, 3, "9-12 Months", 270),
                dose("Typhoid Conjugate Vaccine", "Typhoid fever", 1, 1, "9-12 Months", 270),

                dose("Measles-Mumps-Rubella (MMR)", "Measles, Mumps, Rubella", 2, 2, "16-24 Months", 480),
                dose("DTP Booster", "Diphtheria, Pertussis, Tetanus", 1, 2, "16-24 Months", 480),
                dose("OPV Booster", "Poliomyelitis", 5, 5, "16-24 Months", 480),
                dose("Hepatitis A", "Hepatitis A", 1, 2, "18 Months", 540)
        ));
    }

    private static Vaccine dose(String name, String diseaseTarget, int doseNumber, int totalDoses,
                                 String ageLabel, int ageDays) {
        return Vaccine.builder()
                .name(name)
                .diseaseTarget(diseaseTarget)
                .doseNumber(doseNumber)
                .totalDoses(totalDoses)
                .recommendedAgeLabel(ageLabel)
                .recommendedAgeDays(ageDays)
                .isActive(true)
                .build();
    }
}
