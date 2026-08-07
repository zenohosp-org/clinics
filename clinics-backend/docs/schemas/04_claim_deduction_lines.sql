-- ============================================================================
-- Sprint-2b: claim_deduction_lines (payer-deduction classification).
--
-- WHY: Sprint 2b's NOTE_DEDUCTION records why a claim was settled below approval,
-- split by disposition (WRITE_OFF / APPEAL / RECOVER_FROM_PATIENT), append-only.
--
-- MIGRATION STATUS: NO HAND-RUN REQUIRED under prod's ddl-auto=update — this is a
-- brand-new table, and `update` creates missing tables (and the FK) on boot. This
-- file is the DDL OF RECORD + a manual fallback for any environment where
-- ddl-auto is disabled (validate/none). It is NOT needed alongside a normal
-- deploy. The event type DEDUCTION_NOTED (15 chars) fits the varchar(40)
-- claim_events.event_type already widened in Sprint 2a (03_*), so no ALTER there.
--
-- SAFETY: IF NOT EXISTS guards make this idempotent — running it after Hibernate
-- has already created the table is a no-op. No data change.
-- ============================================================================

CREATE TABLE IF NOT EXISTS claim_deduction_lines (
    id            uuid            NOT NULL PRIMARY KEY,
    claim_id      uuid            NOT NULL,
    disposition   varchar(30)     NOT NULL,   -- WRITE_OFF | APPEAL | RECOVER_FROM_PATIENT
    amount        numeric(15,2)   NOT NULL,   -- this line's slice of (approved − settled)
    reason        text            NOT NULL,
    actor_user_id uuid,
    actor_name    varchar(150),
    created_at    timestamp       NOT NULL,
    CONSTRAINT fk_claim_deduction_lines_claim
        FOREIGN KEY (claim_id) REFERENCES invoice_claims (id)
);

CREATE INDEX IF NOT EXISTS idx_claim_deduction_lines_claim_id
    ON claim_deduction_lines (claim_id);

-- ── Prod verification (read-only) ─────────────────────────────────────────────
-- Confirm the table + FK + index exist after deploy:
--   \d claim_deduction_lines
-- Or:
--   SELECT to_regclass('public.claim_deduction_lines');           -- non-null => exists
--   SELECT conname FROM pg_constraint WHERE conname = 'fk_claim_deduction_lines_claim';
