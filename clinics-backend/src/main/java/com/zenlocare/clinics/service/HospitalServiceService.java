package com.zenlocare.clinics.service;

import com.zenlocare.clinics.entity.Department;
import com.zenlocare.clinics.entity.HospitalService;
import com.zenlocare.clinics.exception.BadRequestException;
import com.zenlocare.clinics.repository.DepartmentRepository;
import com.zenlocare.clinics.repository.HospitalServiceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class HospitalServiceService {

    private final HospitalServiceRepository repository;
    private final DepartmentRepository departmentRepository;

    public List<HospitalService> getServicesByHospital(UUID hospitalId) {
        return repository.findByHospitalId(hospitalId);
    }

    @Transactional
    public HospitalService createService(HospitalService service) {
        validateDepartment(service.getHospitalId(), service.getDepartmentId());
        return repository.save(service);
    }

    @Transactional
    public HospitalService updateService(UUID id, HospitalService details) {
        HospitalService service = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Service not found"));

        validateDepartment(service.getHospitalId(), details.getDepartmentId());

        service.setName(details.getName());
        service.setDepartmentId(details.getDepartmentId());
        service.setPrice(details.getPrice());
        service.setGstRate(details.getGstRate());
        service.setIsActive(details.getIsActive());

        return repository.save(service);
    }

    /**
     * A service must be tied to a department that exists and belongs to the
     * same hospital. The department_id column is a bare NOT NULL UUID with no
     * FK, so without this check a missing value 500s at the DB and a foreign /
     * cross-tenant UUID would be silently accepted.
     */
    private void validateDepartment(UUID hospitalId, UUID departmentId) {
        if (departmentId == null) {
            throw new BadRequestException("Department is required");
        }
        Department dept = departmentRepository.findById(departmentId)
                .orElseThrow(() -> new BadRequestException("Department does not belong to this hospital"));
        if (dept.getHospital() == null || !dept.getHospital().getId().equals(hospitalId)) {
            throw new BadRequestException("Department does not belong to this hospital");
        }
    }

    @Transactional
    public void deleteService(UUID id) {
        repository.deleteById(id);
    }

    @Transactional
    public void toggleStatus(UUID id) {
        HospitalService service = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Service not found"));
        service.setIsActive(!service.getIsActive());
        repository.save(service);
    }
}
