package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.BiomedicalWasteLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface BiomedicalWasteLogRepository extends JpaRepository<BiomedicalWasteLog, UUID> {

    @Query("""
        SELECT l FROM BiomedicalWasteLog l
        WHERE l.hospital.id = :hospitalId
          AND (:from IS NULL OR l.logDate >= :from)
          AND (:to IS NULL OR l.logDate <= :to)
          AND (:categoryCode IS NULL OR l.categoryCode = :categoryCode)
          AND (:generationPointCode IS NULL OR l.generationPointCode = :generationPointCode)
          AND (:pendingOnly = false OR l.handover IS NULL)
        ORDER BY l.logDate DESC, l.createdAt DESC
        """)
    List<BiomedicalWasteLog> filter(@Param("hospitalId") UUID hospitalId,
                                     @Param("from") LocalDate from,
                                     @Param("to") LocalDate to,
                                     @Param("categoryCode") String categoryCode,
                                     @Param("generationPointCode") String generationPointCode,
                                     @Param("pendingOnly") boolean pendingOnly);

    List<BiomedicalWasteLog> findByIdInAndHospital_Id(List<UUID> ids, UUID hospitalId);

    long countByHandover_Id(UUID handoverId);

    @Query("SELECT COALESCE(SUM(l.weightKg), 0) FROM BiomedicalWasteLog l WHERE l.hospital.id = :hospitalId AND l.logDate = :date")
    BigDecimal sumWeightByDate(@Param("hospitalId") UUID hospitalId, @Param("date") LocalDate date);

    @Query("SELECT COALESCE(SUM(l.weightKg), 0) FROM BiomedicalWasteLog l WHERE l.hospital.id = :hospitalId AND l.logDate BETWEEN :from AND :to")
    BigDecimal sumWeightBetween(@Param("hospitalId") UUID hospitalId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("SELECT COALESCE(SUM(l.weightKg), 0) FROM BiomedicalWasteLog l WHERE l.hospital.id = :hospitalId AND l.handover IS NULL")
    BigDecimal sumPending(@Param("hospitalId") UUID hospitalId);

    /** Pending (not yet handed over) total kg grouped by waste category. */
    @Query("""
        SELECT l.categoryCode, SUM(l.weightKg) FROM BiomedicalWasteLog l
        WHERE l.hospital.id = :hospitalId AND l.handover IS NULL
        GROUP BY l.categoryCode
        """)
    List<Object[]> pendingByCategory(@Param("hospitalId") UUID hospitalId);
}
