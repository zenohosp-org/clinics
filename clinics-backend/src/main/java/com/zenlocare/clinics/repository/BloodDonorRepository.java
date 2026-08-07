package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.BloodDonor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface BloodDonorRepository extends JpaRepository<BloodDonor, UUID> {

    List<BloodDonor> findByHospital_IdOrderByCreatedAtDesc(UUID hospitalId);

    Optional<BloodDonor> findByHospital_IdAndDonorCode(UUID hospitalId, String donorCode);

    long countByHospital_Id(UUID hospitalId);

    @Query("""
        SELECT d FROM BloodDonor d
        WHERE d.hospital.id = :hospitalId
          AND (
            LOWER(d.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(d.lastName)  LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(d.phone)     LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(d.donorCode) LIKE LOWER(CONCAT('%', :search, '%'))
          )
        ORDER BY d.createdAt DESC
        """)
    Page<BloodDonor> search(@Param("hospitalId") UUID hospitalId,
                            @Param("search") String search,
                            Pageable pageable);
}
