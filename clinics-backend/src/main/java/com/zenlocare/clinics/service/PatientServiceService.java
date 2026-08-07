package com.zenlocare.clinics.service;

import com.zenlocare.clinics.entity.PatientService;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.repository.PatientServiceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class PatientServiceService {

    private final PatientServiceRepository repository;

    public List<PatientService> getServicesByHospital(UUID hospitalId) {
        return repository.findByHospitalId(hospitalId);
    }

    public PatientService getServiceById(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Patient service not found"));
    }

    @Transactional
    public PatientService createService(PatientService service) {
        return repository.save(service);
    }

    @Transactional
    public PatientService updateService(UUID id, PatientService details) {
        PatientService service = getServiceById(id);
        
        service.setName(details.getName());
        service.setType(details.getType());
        service.setMealTime(details.getMealTime());
        service.setChargeTime(details.getChargeTime());
        service.setPricePerMeal(details.getPricePerMeal());
        service.setPricePerDay(details.getPricePerDay());
        service.setIsActive(details.getIsActive());
        service.setOneTimeCharge(details.getOneTimeCharge() != null && details.getOneTimeCharge());
        
        return repository.save(service);
    }

    @Transactional
    public void deleteService(UUID id) {
        repository.deleteById(id);
    }

    @Transactional
    public void toggleStatus(UUID id) {
        PatientService service = getServiceById(id);
        service.setIsActive(!service.getIsActive());
        repository.save(service);
    }

    @Transactional
    public void saveOrUpdateServices(UUID hospitalId, List<PatientService> services) {
        // Set hospital ID for all services
        services.forEach(s -> s.setHospitalId(hospitalId));
        
        // Delete existing services for this hospital
        List<PatientService> existing = repository.findByHospitalId(hospitalId);
        repository.deleteAll(existing);
        
        // Save all new services
        repository.saveAll(services);
    }
}
