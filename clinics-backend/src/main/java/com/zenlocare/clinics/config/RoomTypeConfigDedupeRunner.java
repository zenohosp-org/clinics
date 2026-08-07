package com.zenlocare.clinics.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * One-time data cleanup for room_type_configs.
 *
 * Background: the original seeder used INSERT ... ON CONFLICT (hospital_id, code)
 * for system rows where hospital_id is NULL. Postgres treats NULL ≠ NULL in
 * unique constraints, so the ON CONFLICT clause never fired for system rows
 * and every boot appended a fresh copy. Production accumulated ~94 duplicate
 * rows per system code, which made findSystemByCode throw
 * NonUniqueResultException and broke every OT surgery start.
 *
 * This runner deduplicates the table on each boot (idempotent: zero work
 * after the first run), then installs a partial unique index on (code)
 * WHERE hospital_id IS NULL so the table can't drift back into the same
 * state — even if some future code path bypasses the seeder.
 *
 * Runs at @Order(0) so it executes BEFORE DataSeeder (which is unordered
 * and therefore LOWEST_PRECEDENCE). That way the dedupe completes before
 * seedRoomTypeConfigs gets a chance to touch the table this boot.
 */
@Component
@RequiredArgsConstructor
@Slf4j
@Order(0)
public class RoomTypeConfigDedupeRunner implements CommandLineRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(String... args) {
        // Dedupe — keep the earliest row per (hospital_id, code) pair, drop
        // every other duplicate. ctid is used for tie-breaking when rows
        // share a created_at. IS NOT DISTINCT FROM gives NULL-safe equality
        // so hospital_id=NULL rows are grouped correctly.
        try {
            int deleted = jdbc.update("""
                DELETE FROM room_type_configs t
                 WHERE t.ctid <> (
                     SELECT min(t2.ctid)
                       FROM room_type_configs t2
                      WHERE t2.code = t.code
                        AND t2.hospital_id IS NOT DISTINCT FROM t.hospital_id
                 )
            """);
            if (deleted > 0) {
                log.info("✅ Deduped room_type_configs: removed {} duplicate rows", deleted);
            } else {
                log.info("room_type_configs already deduped, no rows removed");
            }
        } catch (Exception e) {
            // Brand-new install: table doesn't exist yet. DataSeeder will
            // create it. Subsequent boots will dedupe (zero rows to dedupe).
            log.warn("Could not dedupe room_type_configs: {}", e.getMessage());
        }

        // Partial unique index — belt-and-braces. Prevents anything (manual
        // SQL, future code paths, broken seeders) from re-introducing
        // duplicate system rows. The full (hospital_id, code) UNIQUE
        // constraint on the table doesn't cover NULL pairs due to Postgres
        // semantics; this partial index closes that gap.
        try {
            jdbc.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS uniq_room_type_configs_system_code " +
                "ON room_type_configs (code) WHERE hospital_id IS NULL"
            );
            log.info("✅ Verified partial unique index uniq_room_type_configs_system_code");
        } catch (Exception e) {
            log.warn("Could not create partial unique index: {}", e.getMessage());
        }
    }
}
