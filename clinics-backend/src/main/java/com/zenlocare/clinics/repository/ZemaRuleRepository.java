package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.ZemaRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface ZemaRuleRepository extends JpaRepository<ZemaRule, UUID> {

    /**
     * Returns system-wide active rules (hospital IS NULL) + hospital-specific active rules,
     * sorted by sortHint, then label.
     */
    @Query("SELECT r FROM ZemaRule r WHERE (r.hospital.id = :hospitalId OR r.hospital IS NULL) AND r.isActive = true ORDER BY r.sortHint ASC, r.label ASC")
    List<ZemaRule> findActiveByHospitalId(@Param("hospitalId") UUID hospitalId);
}
