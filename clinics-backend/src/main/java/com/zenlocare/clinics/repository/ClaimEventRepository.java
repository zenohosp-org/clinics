package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.ClaimEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * Append-only access to {@code claim_events}. Callers only ever {@code save}
 * (INSERT) and read — nothing in the codebase updates or deletes an event, by
 * design (see {@link ClaimEvent}).
 */
public interface ClaimEventRepository extends JpaRepository<ClaimEvent, UUID> {

    List<ClaimEvent> findByClaim_IdOrderByCreatedAtAsc(UUID claimId);

    long countByClaim_Id(UUID claimId);
}
