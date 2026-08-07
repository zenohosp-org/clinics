package com.zenlocare.clinics.service;

import com.zenlocare.clinics.dto.DepartmentDTO;
import com.zenlocare.clinics.dto.DepartmentRequest;
import com.zenlocare.clinics.entity.Department;
import com.zenlocare.clinics.entity.Hospital;
import com.zenlocare.clinics.repository.DepartmentRepository;
import com.zenlocare.clinics.repository.HospitalRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class DepartmentService {

    private final DepartmentRepository departmentRepository;
    private final HospitalRepository hospitalRepository;

    public List<DepartmentDTO> getAll(UUID hospitalId) {
        return departmentRepository.findByHospitalIdOrderByTypeAscNameAsc(hospitalId)
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    public List<DepartmentDTO> getActive(UUID hospitalId) {
        return departmentRepository.findByHospitalIdAndIsActiveTrue(hospitalId)
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    @Transactional
    public DepartmentDTO create(DepartmentRequest req) {
        Hospital hospital = hospitalRepository.findById(req.getHospitalId())
                .orElseThrow(() -> new RuntimeException("Hospital not found"));
        if (departmentRepository.findByHospitalIdAndName(req.getHospitalId(), req.getName()).isPresent()) {
            throw new RuntimeException("Department already exists: " + req.getName());
        }
        Department dept = Department.builder()
                .hospital(hospital)
                .name(req.getName())
                .type(req.getType())
                .code(req.getCode())
                .description(req.getDescription())
                .build();
        return toDTO(departmentRepository.save(dept));
    }

    @Transactional
    public DepartmentDTO toggle(UUID id) {
        Department dept = departmentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Department not found"));
        dept.setIsActive(!dept.getIsActive());
        return toDTO(departmentRepository.save(dept));
    }

    @Transactional
    public DepartmentDTO update(UUID id, DepartmentRequest req) {
        Department dept = departmentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Department not found"));
        dept.setName(req.getName());
        dept.setType(req.getType());
        dept.setCode(req.getCode());
        dept.setDescription(req.getDescription());
        return toDTO(departmentRepository.save(dept));
    }

    public DepartmentDTO toDTO(Department d) {
        return DepartmentDTO.builder()
                .id(d.getId())
                .name(d.getName())
                .type(d.getType())
                .code(d.getCode())
                .description(d.getDescription())
                .isActive(d.getIsActive())
                .build();
    }
}
