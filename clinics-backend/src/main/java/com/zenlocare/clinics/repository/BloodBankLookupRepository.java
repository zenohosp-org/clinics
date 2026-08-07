package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.BloodBankLookup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface BloodBankLookupRepository extends JpaRepository<BloodBankLookup, UUID> {

    /**
     * System + hospital-specific entries of a given lookup_type, active
     * only, ordered by displayOrder then label. Returns the union — both
     * the system defaults (hospital_id IS NULL) and any hospital-specific
     * overrides. The caller decides whether to dedup by code, preferring
     * the hospital-specific row.
     */
    @Query("""
        SELECT l FROM BloodBankLookup l
        WHERE (l.hospital.id = :hospitalId OR l.hospital IS NULL)
          AND l.lookupType = :lookupType
          AND l.isActive = true
        ORDER BY l.displayOrder ASC, l.label ASC
        """)
    List<BloodBankLookup> findActiveByHospitalIdAndType(
            @Param("hospitalId") UUID hospitalId,
            @Param("lookupType") String lookupType);

    /**
     * Lookup a specific code within a type. Returns hospital-specific row
     * if present; falls back to system default.
     */
    @Query("""
        SELECT l FROM BloodBankLookup l
        WHERE (l.hospital.id = :hospitalId OR l.hospital IS NULL)
          AND l.lookupType = :lookupType
          AND l.code = :code
        ORDER BY l.hospital DESC NULLS LAST
        """)
    List<BloodBankLookup> findByHospitalIdAndTypeAndCode(
            @Param("hospitalId") UUID hospitalId,
            @Param("lookupType") String lookupType,
            @Param("code") String code);

    @Query("""
        SELECT CASE WHEN COUNT(l) > 0 THEN TRUE ELSE FALSE END
        FROM BloodBankLookup l
        WHERE l.hospital IS NULL AND l.lookupType = :lookupType AND l.code = :code
        """)
    boolean existsSystemEntry(@Param("lookupType") String lookupType, @Param("code") String code);

    default Optional<BloodBankLookup> resolve(UUID hospitalId, String lookupType, String code) {
        List<BloodBankLookup> hits = findByHospitalIdAndTypeAndCode(hospitalId, lookupType, code);
        return hits.isEmpty() ? Optional.empty() : Optional.of(hits.get(0));
    }
}
