package com.zenlocare.clinics.service;

import com.zenlocare.clinics.entity.Specialization;
import com.zenlocare.clinics.repository.DoctorRepository;
import com.zenlocare.clinics.repository.SpecializationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class SpecializationService {

    private final SpecializationRepository specializationRepository;
    private final DoctorRepository doctorRepository;

    public List<Specialization> getSpecializationsByHospital(UUID hospitalId) {
        return specializationRepository.findByHospitalId(hospitalId);
    }

    public long getDoctorCount(UUID hospitalId, UUID specializationId) {
        return doctorRepository.countByHospitalIdAndAnySpecializationId(hospitalId, specializationId);
    }

    @Transactional
    public Specialization createSpecialization(Specialization specialization) {
        return specializationRepository.save(specialization);
    }

    @Transactional
    public Specialization updateSpecialization(UUID id, Specialization specializationData) {
        Specialization specialization = specializationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Specialization not found"));
        
        specialization.setName(specializationData.getName());
        specialization.setDescription(specializationData.getDescription());
        
        return specializationRepository.save(specialization);
    }

    @Transactional
    public void deleteSpecialization(UUID id) {
        specializationRepository.deleteById(id);
    }
}
