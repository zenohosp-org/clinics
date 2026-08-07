-- ============================================================================
-- Sprint-2a: widen claim_events.event_type from varchar(20) to varchar(40).
--
-- WHY: Sprint 2a adds the event type ENHANCEMENT_REQUESTED (21 chars), which
-- overflows the varchar(20) the column was created with in Sprint 1. Hibernate's
-- ddl-auto=update ADDS missing tables/columns but does NOT alter an existing
-- column's length, so this widening has to be applied explicitly.
--
-- WHEN: only needed if claim_events was already created at length 20 (i.e. a
-- Sprint 1 deploy landed before Sprint 2a). If both sprints deploy together, the
-- table is created fresh at varchar(40) and this is a harmless no-op. Prod has no
-- claim_events table yet (verified read-only), so today it is a no-op either way.
--
-- SAFETY: idempotent — widening to a length the column may already have is a
-- no-op ALTER; it never truncates. Single statement, instant metadata change.
-- ============================================================================

ALTER TABLE claim_events ALTER COLUMN event_type TYPE varchar(40);
