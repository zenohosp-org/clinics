package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.AmbulanceVehicle;
import com.zenlocare.clinics.entity.AmbulanceVehicleStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AmbulanceVehicleRepository extends JpaRepository<AmbulanceVehicle, Long> {
    List<AmbulanceVehicle> findByHospital_IdOrderByCreatedAtDesc(UUID hospitalId);
    List<AmbulanceVehicle> findByHospital_IdAndStatusOrderByVehicleNumberAsc(UUID hospitalId, AmbulanceVehicleStatus status);
}
