package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Doctor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;
import java.util.Optional;

@Repository
public interface DoctorRepository extends JpaRepository<Doctor, UUID> {
    List<Doctor> findByHospitalId(UUID hospitalId);

    long countByHospitalId(UUID hospitalId);

    Optional<Doctor> findByUserId(UUID userId);

    List<Doctor> findByHospitalIdAndSpecialization(UUID hospitalId, String specialization);

    @Query("SELECT COUNT(d) FROM Doctor d WHERE d.hospital.id = :hospitalId AND (" +
           ":specId = d.specializationId1 OR :specId = d.specializationId2 OR " +
           ":specId = d.specializationId3 OR :specId = d.specializationId4 OR " +
           ":specId = d.specializationId5 OR :specId = d.specializationId6)")
    long countByHospitalIdAndAnySpecializationId(@Param("hospitalId") UUID hospitalId, @Param("specId") UUID specId);
}
