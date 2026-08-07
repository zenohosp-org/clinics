package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.AmbulanceType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AmbulanceTypeRepository extends JpaRepository<AmbulanceType, Long> {
    List<AmbulanceType> findByHospitalIdAndActiveTrue(UUID hospitalId);
}
