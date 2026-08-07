package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Bed;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BedRepository extends JpaRepository<Bed, Long> {
    List<Bed> findByRoomIdOrderByBedNumberAsc(Long roomId);

    @Query("SELECT b FROM Bed b LEFT JOIN b.room r LEFT JOIN r.hospitalWard rw LEFT JOIN b.ward w " +
           "WHERE b.hospital.id = :hospitalId " +
           "AND b.isActive = true " +
           "AND b.isUnderMaintenance = false " +
           "AND NOT EXISTS (SELECT 1 FROM Admission a WHERE a.bed = b AND a.status = com.zenlocare.clinics.entity.AdmissionStatus.ADMITTED) " +
           "AND (r IS NULL OR (r.isActive = true AND rw IS NOT NULL AND rw.isActive = true)) " +
           "AND (w IS NULL OR w.isActive = true)")
    List<Bed> fetchAvailableBeds(@Param("hospitalId") java.util.UUID hospitalId);

    @Query("SELECT b FROM Bed b LEFT JOIN b.room r LEFT JOIN r.hospitalWard rw LEFT JOIN b.ward w " +
           "WHERE b.hospital.id = :hospitalId " +
           "AND b.isActive = true " +
           "AND (r IS NULL OR (r.isActive = true AND rw IS NOT NULL AND rw.isActive = true)) " +
           "AND (w IS NULL OR w.isActive = true)")
    List<Bed> fetchAllActiveBeds(@Param("hospitalId") java.util.UUID hospitalId);

    List<Bed> findByWardIdOrderByBedNumberAsc(Long wardId);
    long countByRoomId(Long roomId);
    long countByWardId(Long wardId);
    boolean existsByIdAndHospitalId(Long id, java.util.UUID hospitalId);

    /**
     * Batched per-room bed-count used by the Rooms list to avoid a {@code countByRoomId}
     * call per row. Returns {@code Object[]{roomId, count}} which the caller folds
     * into a {@code Map<Long, Long>}.
     */
    @Query("SELECT b.room.id, COUNT(b) FROM Bed b " +
           "WHERE b.hospital.id = :hospitalId AND b.isActive = true AND b.room IS NOT NULL " +
           "GROUP BY b.room.id")
    List<Object[]> countActiveBedsGroupedByRoom(@Param("hospitalId") java.util.UUID hospitalId);
}
