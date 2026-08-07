package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Designation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface DesignationRepository extends JpaRepository<Designation, UUID> {
    List<Designation> findByHospitalIdOrderByCategoryAscNameAsc(UUID hospitalId);
    List<Designation> findByHospitalIdAndIsActiveTrue(UUID hospitalId);
    List<Designation> findByHospitalIdAndDepartmentIdOrderByNameAsc(UUID hospitalId, UUID departmentId);
    List<Designation> findByHospitalIdAndDepartmentIsNullAndIsActiveTrue(UUID hospitalId);
}
