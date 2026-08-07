package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Room;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface RoomRepository extends JpaRepository<Room, Long> {

    List<Room> findByHospitalId(UUID hospitalId);



    Optional<Room> findByHospitalIdAndRoomNumber(UUID hospitalId, String roomNumber);



    boolean existsByHospitalId(UUID hospitalId);

    List<Room> findByHospitalWard_Id(Long wardId);

    List<Room> findByHospitalIdAndHospitalWardIsNotNull(UUID hospitalId);

    // Matches both legacy "RM-NNNN" and prefixed "1001-RM-NNNN" formats; max sequence computed in service.
    @Query("SELECT r.roomCode FROM Room r WHERE r.hospital.id = :hospitalId AND r.roomCode LIKE '%RM-%'")
    List<String> findRoomCodes(@Param("hospitalId") UUID hospitalId);

    long countByHospitalId(UUID hospitalId);
}
