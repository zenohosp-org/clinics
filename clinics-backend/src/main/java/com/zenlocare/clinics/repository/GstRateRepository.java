package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.GstRate;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface GstRateRepository extends JpaRepository<GstRate, UUID> {
    List<GstRate> findAllByOrderByRatePercentAsc();
    List<GstRate> findByIsActiveTrueOrderByRatePercentAsc();
    List<GstRate> findByIsDefaultTrue();
}
