package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.PatientVaccination;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PatientVaccinationRepository extends JpaRepository<PatientVaccination, UUID> {

    @EntityGraph(attributePaths = {"administeredBy"})
    List<PatientVaccination> findByPatientIdAndHospitalIdOrderByScheduledDateAsc(
            Integer patientId, UUID hospitalId);

    Optional<PatientVaccination> findByIdAndHospitalId(UUID id, UUID hospitalId);

    List<PatientVaccination> findByPatientIdAndHospitalIdAndVaccineIdIsNotNull(
            Integer patientId, UUID hospitalId);
}
