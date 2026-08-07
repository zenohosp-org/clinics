package com.zenlocare.clinics.scheduler;

import com.zenlocare.clinics.entity.InvoiceClaim;
import com.zenlocare.clinics.repository.InvoiceClaimRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Daily sweep that flags claims sitting too long in a pending state
 * ({@code pending_with != NONE}) so the insurance desk can chase them before
 * they rot into the shadow-Excel problem. Threshold is configurable
 * ({@code claims.aging.threshold-days}, default 3).
 *
 * <p>Sprint 1 scope: LOG only — one structured warn line per stale claim, plus a
 * summary. Email/notification is deliberately out of scope (no outbound-mail
 * infra exists yet).
 *
 * <p>Auth context: this is a background job with no HTTP request, so there is no
 * {@code SecurityContext} to read — and it deliberately reads none. It queries
 * the repository directly across all hospitals (no user-scoped, hospital-guarded
 * call), mirroring the documented no-context pattern in {@code SmartBillingService}.
 * There is no unguarded {@code SecurityContextHolder.getContext()} access here.
 */
@Component
public class ClaimAgingScheduler {

    private static final Logger log = LoggerFactory.getLogger(ClaimAgingScheduler.class);

    private final InvoiceClaimRepository claimRepository;

    @Value("${claims.aging.threshold-days:3}")
    private int thresholdDays;

    public ClaimAgingScheduler(InvoiceClaimRepository claimRepository) {
        this.claimRepository = claimRepository;
    }

    /** 06:00 IST daily. */
    @Scheduled(cron = "0 0 6 * * *")
    public void flagStaleClaims() {
        log.info("[ClaimAging] Starting stale-claim scan (threshold {} days)...", thresholdDays);
        try {
            List<InvoiceClaim> pending = claimRepository.findByPendingWithNot("NONE");
            LocalDate today = LocalDate.now();
            int stale = 0;
            for (InvoiceClaim c : pending) {
                if (c.getPendingSince() == null) continue; // legacy rows without a pending clock
                long age = ChronoUnit.DAYS.between(c.getPendingSince().toLocalDate(), today);
                if (age > thresholdDays) {
                    stale++;
                    log.warn("[ClaimAging] STALE claim id={} hospitalId={} status={} pendingWith={} "
                                    + "ageDays={} thresholdDays={} claimedAmount={}",
                            c.getId(), c.getHospitalId(), c.getStatus(), c.getPendingWith(),
                            age, thresholdDays, c.getClaimedAmount());
                }
            }
            log.info("[ClaimAging] Scan complete: {} pending, {} stale (age > {} days).",
                    pending.size(), stale, thresholdDays);
        } catch (Exception e) {
            log.error("[ClaimAging] Scan failed: {}", e.getMessage(), e);
        }
    }
}
