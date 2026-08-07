package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Discharge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface DischargeRepository extends JpaRepository<Discharge, Long> {
    Optional<Discharge> findByAdmission_Id(UUID admissionId);
    boolean existsByAdmission_Id(UUID admissionId);
}
