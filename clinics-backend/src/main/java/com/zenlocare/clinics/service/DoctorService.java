package com.zenlocare.clinics.service;

import com.zenlocare.clinics.entity.Doctor;
import com.zenlocare.clinics.entity.DoctorAvailability;
import com.zenlocare.clinics.entity.Hospital;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.exception.ConflictException;
import com.zenlocare.clinics.repository.DoctorAvailabilityRepository;
import com.zenlocare.clinics.repository.DoctorRepository;
import com.zenlocare.clinics.repository.HospitalRepository;
import com.zenlocare.clinics.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class DoctorService {

    private final DoctorRepository doctorRepository;
    private final UserRepository userRepository;
    private final HospitalRepository hospitalRepository;
    private final DoctorAvailabilityRepository availabilityRepository;

    // MON=0 … SUN=6; bit n = 1 << n
    private static final int[] DAY_BITS = {1, 2, 4, 8, 16, 32, 64};

    public List<Doctor> getDoctorsByHospital(UUID hospitalId) {
        return doctorRepository.findByHospitalId(hospitalId);
    }

    public List<Doctor> getDoctorsByHospitalAndSpecialization(UUID hospitalId, String specialization) {
        return doctorRepository.findByHospitalIdAndSpecialization(hospitalId, specialization);
    }

    public Doctor getDoctorById(UUID id) {
        return doctorRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Doctor not found"));
    }

    public Doctor getDoctorByUserId(UUID userId) {
        return doctorRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Doctor not found for user: " + userId));
    }

    @Transactional
    public Doctor createDoctor(UUID userId, UUID hospitalId, Doctor doctorData) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));

        if (!"doctor".equalsIgnoreCase(user.getRole().getName())) {
            throw new ConflictException("User does not have the doctor role");
        }

        if (doctorRepository.findByUserId(userId).isPresent()) {
            throw new ConflictException("Doctor profile already exists for this user");
        }

        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Hospital not found"));

        Doctor doctor = Doctor.builder()
                .user(user)
                .hospital(hospital)
                .specializationId1(doctorData.getSpecializationId1())
                .specializationId2(doctorData.getSpecializationId2())
                .specializationId3(doctorData.getSpecializationId3())
                .specializationId4(doctorData.getSpecializationId4())
                .specializationId5(doctorData.getSpecializationId5())
                .specializationId6(doctorData.getSpecializationId6())
                .specialization(doctorData.getSpecialization())
                .qualification(doctorData.getQualification())
                .medicalRegistrationNumber(doctorData.getMedicalRegistrationNumber())
                .registrationCouncil(doctorData.getRegistrationCouncil())
                .consultationFee(doctorData.getConsultationFee())
                .followUpFee(doctorData.getFollowUpFee())
                .availableDaysMask(doctorData.getAvailableDaysMask() != null ? doctorData.getAvailableDaysMask() : 31)
                .slotDurationMin(doctorData.getSlotDurationMin() != null ? doctorData.getSlotDurationMin() : 15)
                .maxDailySlots(doctorData.getMaxDailySlots())
                .workPhone(doctorData.getWorkPhone())
                .personalPhone(doctorData.getPersonalPhone())
                .workEmail(doctorData.getWorkEmail())
                .personalEmail(doctorData.getPersonalEmail())
                .workAddress(doctorData.getWorkAddress())
                .residentialAddress(doctorData.getResidentialAddress())
                .build();

        Doctor saved = doctorRepository.save(doctor);
        seedAvailability(saved);
        return saved;
    }

    private void seedAvailability(Doctor doctor) {
        int mask = doctor.getAvailableDaysMask() != null ? doctor.getAvailableDaysMask() : 0;
        int slotMins = doctor.getSlotDurationMin() != null ? doctor.getSlotDurationMin() : 15;
        int maxSlots = doctor.getMaxDailySlots() != null ? doctor.getMaxDailySlots() : 40;

        for (int dayIdx = 0; dayIdx < DAY_BITS.length; dayIdx++) {
            if ((mask & DAY_BITS[dayIdx]) == 0) continue;
            final int day = dayIdx;
            boolean exists = availabilityRepository.findByDoctorIdAndDayOfWeek(doctor.getId(), day).isPresent();
            if (!exists) {
                availabilityRepository.save(
                    DoctorAvailability.builder()
                        .doctor(doctor)
                        .dayOfWeek(day)
                        .startTime(LocalTime.of(9, 0))
                        .endTime(LocalTime.of(17, 0))
                        .slotDurationMins(slotMins)
                        .maxDailySlots(maxSlots)
                        .isActive(true)
                        .build()
                );
            }
        }
    }

    @Transactional
    public Doctor updateDoctor(UUID id, Doctor updatedData) {
        Doctor doctor = getDoctorById(id);

        // Always overwrite all 6 spec slots so removed entries become null
        doctor.setSpecializationId1(updatedData.getSpecializationId1());
        doctor.setSpecializationId2(updatedData.getSpecializationId2());
        doctor.setSpecializationId3(updatedData.getSpecializationId3());
        doctor.setSpecializationId4(updatedData.getSpecializationId4());
        doctor.setSpecializationId5(updatedData.getSpecializationId5());
        doctor.setSpecializationId6(updatedData.getSpecializationId6());

        if (updatedData.getSpecialization() != null)
            doctor.setSpecialization(updatedData.getSpecialization());
        if (updatedData.getQualification() != null)
            doctor.setQualification(updatedData.getQualification());
        if (updatedData.getMedicalRegistrationNumber() != null)
            doctor.setMedicalRegistrationNumber(updatedData.getMedicalRegistrationNumber());
        if (updatedData.getRegistrationCouncil() != null)
            doctor.setRegistrationCouncil(updatedData.getRegistrationCouncil());
        if (updatedData.getConsultationFee() != null)
            doctor.setConsultationFee(updatedData.getConsultationFee());
        if (updatedData.getFollowUpFee() != null)
            doctor.setFollowUpFee(updatedData.getFollowUpFee());
        if (updatedData.getAvailableDaysMask() != null)
            doctor.setAvailableDaysMask(updatedData.getAvailableDaysMask());
        if (updatedData.getSlotDurationMin() != null)
            doctor.setSlotDurationMin(updatedData.getSlotDurationMin());
        if (updatedData.getMaxDailySlots() != null)
            doctor.setMaxDailySlots(updatedData.getMaxDailySlots());
        if (updatedData.getWorkPhone() != null)
            doctor.setWorkPhone(updatedData.getWorkPhone());
        if (updatedData.getPersonalPhone() != null)
            doctor.setPersonalPhone(updatedData.getPersonalPhone());
        if (updatedData.getWorkEmail() != null)
            doctor.setWorkEmail(updatedData.getWorkEmail());
        if (updatedData.getPersonalEmail() != null)
            doctor.setPersonalEmail(updatedData.getPersonalEmail());
        if (updatedData.getWorkAddress() != null)
            doctor.setWorkAddress(updatedData.getWorkAddress());
        if (updatedData.getResidentialAddress() != null)
            doctor.setResidentialAddress(updatedData.getResidentialAddress());

        Doctor saved = doctorRepository.save(doctor);
        seedAvailability(saved);
        return saved;
    }

    @Transactional
    public void deleteDoctor(UUID id) {
        Doctor doctor = getDoctorById(id);
        doctorRepository.delete(doctor);
    }
}
