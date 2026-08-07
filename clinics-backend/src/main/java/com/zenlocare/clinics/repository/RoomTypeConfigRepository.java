package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.RoomTypeConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RoomTypeConfigRepository extends JpaRepository<RoomTypeConfig, UUID> {

    /** Returns system-wide types (hospital IS NULL) + hospital-specific types, ordered by displayOrder */
    @Query("SELECT r FROM RoomTypeConfig r WHERE (r.hospital.id = :hospitalId OR r.hospital IS NULL) AND r.isActive = true ORDER BY r.displayOrder ASC, r.label ASC")
    List<RoomTypeConfig> findActiveByHospitalId(UUID hospitalId);

    /** Look up a specific type by hospital + code */
    Optional<RoomTypeConfig> findByHospitalIdAndCode(UUID hospitalId, String code);

    /** Look up a system-wide type by code */
    @Query("SELECT r FROM RoomTypeConfig r WHERE r.hospital IS NULL AND r.code = :code")
    Optional<RoomTypeConfig> findSystemByCode(String code);

    /** Check if a code already exists for a hospital (or system-wide) */
    @Query("SELECT COUNT(r) > 0 FROM RoomTypeConfig r WHERE (r.hospital.id = :hospitalId OR r.hospital IS NULL) AND r.code = :code")
    boolean existsByHospitalIdAndCode(UUID hospitalId, String code);
}
