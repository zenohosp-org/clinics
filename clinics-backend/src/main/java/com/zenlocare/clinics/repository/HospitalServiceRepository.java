package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.HospitalService;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public interface HospitalServiceRepository extends JpaRepository<HospitalService, UUID> {
    List<HospitalService> findByHospitalId(UUID hospitalId);
}
