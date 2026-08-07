package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Department;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DepartmentRepository extends JpaRepository<Department, UUID> {
    List<Department> findByHospitalIdOrderByTypeAscNameAsc(UUID hospitalId);
    List<Department> findByHospitalIdAndIsActiveTrue(UUID hospitalId);
    Optional<Department> findByHospitalIdAndName(UUID hospitalId, String name);
}
