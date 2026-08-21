package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Vaccine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface VaccineRepository extends JpaRepository<Vaccine, UUID> {

    List<Vaccine> findByIsActiveTrueOrderByRecommendedAgeDaysAscNameAsc();

    List<Vaccine> findAllByOrderByRecommendedAgeDaysAscNameAsc();
}
