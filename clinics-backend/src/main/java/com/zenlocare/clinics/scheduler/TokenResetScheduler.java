package com.zenlocare.clinics.scheduler;

import com.zenlocare.clinics.entity.Hospital;
import com.zenlocare.clinics.repository.HospitalRepository;
import com.zenlocare.clinics.service.AppointmentService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Resets the appointment token queue at the top of each day.
 *
 * The token allocator only ever looks at today's appointments (apptDate = today),
 * so yesterday's numbers cannot interfere with today's MAX(token)+1 lookup on
 * their own. The cron still runs because:
 *   - It guarantees every hospital starts the day from token 1 by re-walking
 *     today's already-confirmed early-morning rows in createdAt order (in
 *     practice that set is empty at 00:00 — the call is a no-op).
 *   - It mops up any stray tokens that survived an edge-case status flip.
 *   - It gives operators a predictable contract: "at midnight, the queue
 *     resets" — matches user mental model from the UI's Refresh button.
 *
 * One failing hospital must not break the rest, so each call is isolated.
 */
@Component
@RequiredArgsConstructor
public class TokenResetScheduler {

    private static final Logger log = LoggerFactory.getLogger(TokenResetScheduler.class);

    private final HospitalRepository hospitalRepository;
    private final AppointmentService appointmentService;

    /** Daily at 00:00 local time. */
    @Scheduled(cron = "0 0 0 * * *")
    public void resetDailyTokens() {
        log.info("[TokenResetScheduler] Starting daily token reset...");

        List<Hospital> hospitals = hospitalRepository.findAll();
        int ok = 0, failed = 0, totalAssigned = 0;

        for (Hospital h : hospitals) {
            try {
                int assigned = appointmentService.refreshTokensForToday(h.getId());
                totalAssigned += assigned;
                ok++;
            } catch (Exception e) {
                log.warn("[TokenResetScheduler] Failed for hospital {}: {}", h.getId(), e.getMessage());
                failed++;
            }
        }

        log.info("[TokenResetScheduler] Done. Hospitals ok={}, failed={}, tokens assigned={}",
                ok, failed, totalAssigned);
    }
}
