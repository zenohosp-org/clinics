package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.DoctorAvailability;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface DoctorAvailabilityRepository extends JpaRepository<DoctorAvailability, UUID> {

    List<DoctorAvailability> findByDoctorIdOrderByDayOfWeek(UUID doctorId);

    Optional<DoctorAvailability> findByDoctorIdAndDayOfWeek(UUID doctorId, Integer dayOfWeek);

    void deleteByDoctorId(UUID doctorId);
}
