package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.PatientReferral;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PatientReferralRepository extends JpaRepository<PatientReferral, UUID> {

    @EntityGraph(attributePaths = {"referredBy", "respondedBy"})
    List<PatientReferral> findByAdmissionIdAndHospitalIdOrderByCreatedAtDesc(
            UUID admissionId, UUID hospitalId);

    Optional<PatientReferral> findByIdAndHospitalId(UUID id, UUID hospitalId);
}
