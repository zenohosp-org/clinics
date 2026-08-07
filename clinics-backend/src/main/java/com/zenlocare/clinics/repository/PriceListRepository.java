package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.PriceList;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PriceListRepository extends JpaRepository<PriceList, UUID> {
    List<PriceList> findByHospitalId(UUID hospitalId);

    Optional<PriceList> findByIdAndHospitalId(UUID id, UUID hospitalId);
}
