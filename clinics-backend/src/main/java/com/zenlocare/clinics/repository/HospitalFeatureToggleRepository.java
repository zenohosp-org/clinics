package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.HospitalFeatureToggle;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface HospitalFeatureToggleRepository extends JpaRepository<HospitalFeatureToggle, UUID> {

    List<HospitalFeatureToggle> findByHospitalId(UUID hospitalId);

    Optional<HospitalFeatureToggle> findByHospitalIdAndFeatureKey(UUID hospitalId, String featureKey);
}
