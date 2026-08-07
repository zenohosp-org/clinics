package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.HospitalWard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

public interface HospitalWardRepository extends JpaRepository<HospitalWard, Long> {

    // Null out FK before deleting wards so rooms referencing them don't cause a constraint violation
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(value = "UPDATE rooms SET ward_id = NULL WHERE ward_id IN (SELECT id FROM hospital_wards WHERE floor_id IN (SELECT id FROM hospital_floors WHERE building_id IN (SELECT id FROM hospital_buildings WHERE hospital_id = :hospitalId)))", nativeQuery = true)
    void detachRoomsFromWards(UUID hospitalId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(value = "DELETE FROM hospital_wards WHERE floor_id IN (SELECT id FROM hospital_floors WHERE building_id IN (SELECT id FROM hospital_buildings WHERE hospital_id = :hospitalId))", nativeQuery = true)
    void deleteByHospitalId(UUID hospitalId);
}
