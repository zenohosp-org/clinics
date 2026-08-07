package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.HospitalBuilding;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.UUID;

public interface HospitalBuildingRepository extends JpaRepository<HospitalBuilding, Long> {

    // Only join-fetch one bag (floors); wards load lazily via @BatchSize(50) on HospitalFloor.wards
    @Query("SELECT DISTINCT b FROM HospitalBuilding b LEFT JOIN FETCH b.floors WHERE b.hospital.id = :hospitalId ORDER BY b.displayOrder ASC")
    List<HospitalBuilding> findByHospitalIdWithDetails(UUID hospitalId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(value = "DELETE FROM hospital_buildings WHERE hospital_id = :hospitalId", nativeQuery = true)
    void deleteByHospitalId(UUID hospitalId);
}
