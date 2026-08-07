package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.PatientAllergy;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PatientAllergyRepository extends JpaRepository<PatientAllergy, UUID> {

    @EntityGraph(attributePaths = {"recordedBy"})
    List<PatientAllergy> findByPatientIdAndHospitalIdOrderByCreatedAtAsc(
            Integer patientId, UUID hospitalId);

    Optional<PatientAllergy> findByIdAndHospitalId(UUID id, UUID hospitalId);
}
