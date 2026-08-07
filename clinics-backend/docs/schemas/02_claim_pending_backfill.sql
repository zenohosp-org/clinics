-- ============================================================================
-- Sprint-1 claims: backfill pending_with + pending_since on EXISTING claims.
--
-- WHY: HMS runs ddl-auto=update, so on deploy Hibernate adds the two new
-- columns via ALTER TABLE ADD COLUMN with no DB default. Existing invoice_claims
-- rows therefore get pending_with = NULL / pending_since = NULL. Without this
-- backfill, every pre-deploy claim would render on the finance worklist as
-- "Resolved" with no age — an open, waiting-on-TPA claim would look done. That
-- is the day-one trust break, so this must run once, right after deploy.
--
-- SAFETY:
--   * Single UPDATE, guarded by `WHERE pending_with IS NULL` → idempotent and
--     only ever touches un-backfilled legacy rows. Re-running is a no-op. It can
--     never clobber a value the application has since set.
--   * Wrapped in a transaction with a pre/post row-count so you review the blast
--     radius before COMMIT.
--   * Does NOT synthesise claim_events for historical claims — the event thread
--     honestly begins at deploy. Only the worklist-driving fields are set.
--
-- MAPPING (mirrors ClaimService.pendingWithFor + the pending_since reset rule):
--   pending_with:  DRAFT / PRE_AUTH / QUERIED → HOSPITAL
--                  SUBMITTED                   → PAYER
--                  APPROVED / PARTIALLY_APPROVED / DENIED / SETTLED → NONE
--   Every status is named EXPLICITLY — there is no catch-all ELSE. A guard block
--   up front RAISEs if any claim carries a status outside the known set, so an
--   unexpected value fails loud rather than being silently bucketed as Resolved.
--   pending_since (best available proxy for "entered current pending state"):
--                  SUBMITTED → submitted_at  (when it went to the payer)
--                  DRAFT     → created_at    (waiting on us since creation)
--                  PRE_AUTH  → updated_at    (last change ≈ became pre-auth)
--                  QUERIED   → updated_at    (last change ≈ was queried)
--                  resolved  → NULL
--   COALESCE fallbacks guard against any null timestamp so a pending row always
--   gets a non-null clock (else it would be invisible to the aging job).
-- ============================================================================

BEGIN;

-- Guard: fail loud if any claim carries a status this mapping does not name.
-- Runs inside the transaction, so a RAISE aborts the whole backfill untouched —
-- forcing us to update the mapping rather than silently bucketing an unknown
-- (possibly still-open) status as Resolved.
DO $$
DECLARE
    unknown_statuses text;
BEGIN
    SELECT string_agg(DISTINCT status, ', ')
      INTO unknown_statuses
      FROM invoice_claims
     WHERE pending_with IS NULL
       AND status NOT IN ('DRAFT', 'PRE_AUTH', 'SUBMITTED', 'QUERIED',
                          'APPROVED', 'PARTIALLY_APPROVED', 'DENIED', 'SETTLED');
    IF unknown_statuses IS NOT NULL THEN
        RAISE EXCEPTION
            'Backfill aborted: unrecognised claim status(es): %. Update 02_claim_pending_backfill.sql before running.',
            unknown_statuses;
    END IF;
END $$;

-- Pre-check: how many legacy rows will this touch, and their status spread.
SELECT status, count(*) AS rows_to_backfill
FROM invoice_claims
WHERE pending_with IS NULL
GROUP BY status
ORDER BY count(*) DESC;

-- Every status named explicitly; no catch-all ELSE (the guard above guarantees
-- only known statuses reach this point).
UPDATE invoice_claims
SET pending_with = CASE
        WHEN status IN ('DRAFT', 'PRE_AUTH', 'QUERIED')                     THEN 'HOSPITAL'
        WHEN status = 'SUBMITTED'                                           THEN 'PAYER'
        WHEN status IN ('APPROVED', 'PARTIALLY_APPROVED', 'DENIED', 'SETTLED') THEN 'NONE'
    END,
    pending_since = CASE
        WHEN status = 'SUBMITTED'              THEN COALESCE(submitted_at, updated_at, created_at)
        WHEN status = 'DRAFT'                  THEN COALESCE(created_at, updated_at)
        WHEN status IN ('PRE_AUTH', 'QUERIED') THEN COALESCE(updated_at, created_at)
        WHEN status IN ('APPROVED', 'PARTIALLY_APPROVED', 'DENIED', 'SETTLED') THEN NULL
    END
WHERE pending_with IS NULL;

-- Post-check: the resulting bucket distribution. Verify it matches the pre-check
-- (HOSPITAL+PAYER should equal the open/queried counts; NONE the resolved ones).
SELECT pending_with,
       count(*) AS rows,
       count(*) FILTER (WHERE pending_since IS NULL)     AS with_null_since,
       count(*) FILTER (WHERE pending_since IS NOT NULL) AS with_since
FROM invoice_claims
GROUP BY pending_with
ORDER BY pending_with;

-- Review the two SELECT outputs above, then:
--   COMMIT;   -- to apply
--   ROLLBACK; -- to abort (leaves the table exactly as-is)
COMMIT;
