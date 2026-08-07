package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.ClaimDeductionLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Append-only access to {@code claim_deduction_lines}. Callers only ever
 * {@code save} (INSERT) and read — nothing updates or deletes a line, by design
 * (see {@link ClaimDeductionLine}).
 */
public interface ClaimDeductionLineRepository extends JpaRepository<ClaimDeductionLine, UUID> {

    List<ClaimDeductionLine> findByClaim_IdOrderByCreatedAtAsc(UUID claimId);

    long countByClaim_Id(UUID claimId);

    /** Batched load for the summary/list: every line across a page of claims in one query. */
    List<ClaimDeductionLine> findByClaim_IdIn(Collection<UUID> claimIds);
}
