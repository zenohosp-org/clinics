package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.PatientService;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public interface PatientServiceRepository extends JpaRepository<PatientService, UUID> {
    List<PatientService> findByHospitalId(UUID hospitalId);
}
