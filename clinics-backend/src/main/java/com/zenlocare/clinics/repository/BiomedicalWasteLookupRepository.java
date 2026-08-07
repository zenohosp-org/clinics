package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.BiomedicalWasteLookup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface BiomedicalWasteLookupRepository extends JpaRepository<BiomedicalWasteLookup, UUID> {

    /**
     * System + hospital-specific entries of a given lookup_type, active
     * only, ordered by displayOrder then label. Mirrors
     * BloodBankLookupRepository#findActiveByHospitalIdAndType.
     */
    @Query("""
        SELECT l FROM BiomedicalWasteLookup l
        WHERE (l.hospital.id = :hospitalId OR l.hospital IS NULL)
          AND l.lookupType = :lookupType
          AND l.isActive = true
        ORDER BY l.displayOrder ASC, l.label ASC
        """)
    List<BiomedicalWasteLookup> findActiveByHospitalIdAndType(
            @Param("hospitalId") UUID hospitalId,
            @Param("lookupType") String lookupType);
}
