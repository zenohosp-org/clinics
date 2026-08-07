package com.zenlocare.clinics.service;

import com.zenlocare.clinics.dto.DesignationDTO;
import com.zenlocare.clinics.dto.DesignationRequest;
import com.zenlocare.clinics.entity.Department;
import com.zenlocare.clinics.entity.Designation;
import com.zenlocare.clinics.entity.Hospital;
import com.zenlocare.clinics.repository.DepartmentRepository;
import com.zenlocare.clinics.repository.DesignationRepository;
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
public class DesignationService {

    private final DesignationRepository designationRepository;
    private final HospitalRepository hospitalRepository;
    private final DepartmentRepository departmentRepository;

    public List<DesignationDTO> getAll(UUID hospitalId) {
        return designationRepository.findByHospitalIdOrderByCategoryAscNameAsc(hospitalId)
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    public List<DesignationDTO> getActive(UUID hospitalId) {
        return designationRepository.findByHospitalIdAndIsActiveTrue(hospitalId)
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    public List<DesignationDTO> getByDepartment(UUID hospitalId, UUID departmentId) {
        return designationRepository.findByHospitalIdAndDepartmentIdOrderByNameAsc(hospitalId, departmentId)
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    @Transactional
    public DesignationDTO create(DesignationRequest req) {
        Hospital hospital = hospitalRepository.findById(req.getHospitalId())
                .orElseThrow(() -> new RuntimeException("Hospital not found"));
        Department dept = req.getDepartmentId() != null
                ? departmentRepository.findById(req.getDepartmentId()).orElse(null)
                : null;
        Designation d = Designation.builder()
                .hospital(hospital)
                .department(dept)
                .name(req.getName())
                .category(req.getCategory())
                .build();
        return toDTO(designationRepository.save(d));
    }

    @Transactional
    public DesignationDTO toggle(UUID id) {
        Designation d = designationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Designation not found"));
        d.setIsActive(!d.getIsActive());
        return toDTO(designationRepository.save(d));
    }

    public DesignationDTO toDTO(Designation d) {
        return DesignationDTO.builder()
                .id(d.getId())
                .name(d.getName())
                .category(d.getCategory())
                .departmentId(d.getDepartment() != null ? d.getDepartment().getId() : null)
                .departmentName(d.getDepartment() != null ? d.getDepartment().getName() : null)
                .isActive(d.getIsActive())
                .build();
    }
}
