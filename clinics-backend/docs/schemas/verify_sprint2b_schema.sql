-- ============================================================================
-- Sprint-2b POST-DEPLOY schema verification — READ ONLY.
-- Confirms Sprint 1/2a/2b schema migrated clean under ddl-auto=update.
-- Run against prod; no writes, no locks. Review the three result sets.
-- ============================================================================

-- 1) Tables exist (non-null OID name => present).
SELECT to_regclass('public.invoice_claims')        AS invoice_claims,
       to_regclass('public.claim_events')          AS claim_events,
       to_regclass('public.claim_deduction_lines') AS claim_deduction_lines;

-- 2) Column types / widths across the claims schema surface.
--    Expected:
--      invoice_claims.pending_with        character varying   (exists, nullable)
--      invoice_claims.pending_since       timestamp ...       (exists, nullable)
--      invoice_claims.requested_amount    numeric             (exists, nullable)
--      claim_events.event_type            character varying   max_len = 40   NOT NULL
--      claim_deduction_lines.id           uuid                                NOT NULL
--      claim_deduction_lines.claim_id     uuid                                NOT NULL
--      claim_deduction_lines.disposition  character varying   max_len = 30   NOT NULL
--      claim_deduction_lines.amount       numeric             prec=15 scale=2 NOT NULL
--      claim_deduction_lines.reason       text                                NOT NULL
--      claim_deduction_lines.actor_user_id uuid                               nullable
--      claim_deduction_lines.actor_name   character varying   max_len = 150  nullable
--      claim_deduction_lines.created_at   timestamp ...                       NOT NULL
SELECT table_name, column_name, data_type,
       character_maximum_length AS max_len,
       numeric_precision        AS prec,
       numeric_scale            AS scale,
       is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND (
      (table_name = 'invoice_claims'        AND column_name IN ('pending_with','pending_since','requested_amount'))
   OR (table_name = 'claim_events'          AND column_name = 'event_type')
   OR (table_name = 'claim_deduction_lines' AND column_name IN
         ('id','claim_id','disposition','amount','reason','actor_user_id','actor_name','created_at'))
)
ORDER BY table_name, column_name;

-- 3) FK + index on the new table (expected: one row each).
SELECT conname AS foreign_key
FROM pg_constraint
WHERE conname = 'fk_claim_deduction_lines_claim';

SELECT indexname
FROM pg_indexes
WHERE tablename = 'claim_deduction_lines';

-- 4) Optional: prove append-only is intact — no rows should ever be updated.
--    (No assertion here; just a count so you can see current volume.)
SELECT count(*) AS claim_deduction_lines_rows FROM claim_deduction_lines;
