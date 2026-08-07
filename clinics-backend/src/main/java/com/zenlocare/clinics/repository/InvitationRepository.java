package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Invitation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface InvitationRepository extends JpaRepository<Invitation, Integer> {
    Optional<Invitation> findByToken(String token);

    List<Invitation> findByHospitalId(UUID hospitalId);

    List<Invitation> findByInvitedEmailAndStatus(String email, String status);
}
