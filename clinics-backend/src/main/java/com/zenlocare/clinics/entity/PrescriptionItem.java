package com.zenlocare.clinics.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One line of a prescription. Multiple PrescriptionItems belong to one
 * PatientRecord (historyType=PRESCRIPTION). Pharmacy reads these rows to
 * dispense; HMS does not track dispense state here — that belongs on pharmacy's
 * own dispense table.
 *
 * Drug metadata is denormalised from {@code pharmacy_drug_master} at write
 * time so a prescription survives drug-master renames, soft-deletes, or
 * cross-hospital cleanup. {@code drugId} is the live FK (nullable to allow
 * free-text prescription of a drug not yet in the master).
 */
@Entity
@Table(
    name = "prescription_items",
    indexes = {
        @Index(name = "idx_prescription_items_history_id", columnList = "history_id"),
        @Index(name = "idx_prescription_items_drug_id",    columnList = "drug_id")
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PrescriptionItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /**
     * Parent prescription record. Cascade is configured on the OneToMany side
     * (PatientRecord.prescriptionItems) so removing a parent removes all items.
     * JsonIgnore prevents infinite recursion when serialising.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "history_id", nullable = false)
    @JsonIgnore
    private PatientRecord record;

    /**
     * Soft pointer to pharmacy_drug_master.id. Nullable because:
     *  (a) doctors may prescribe a drug not yet in the hospital's master, and
     *  (b) the master row could be deleted while the prescription stays.
     * The denormalised drug_name / generic / strength / form fields below carry
     * the dispensable description regardless.
     */
    @Column(name = "drug_id")
    private UUID drugId;

    @Column(name = "drug_name", nullable = false, length = 255)
    private String drugName;

    @Column(name = "drug_generic", length = 255)
    private String drugGeneric;

    @Column(name = "drug_strength", length = 100)
    private String drugStrength;

    /** Form factor — TAB, CAP, SYRUP, INJ, DROPS, OINT, INH, etc. */
    @Column(name = "drug_form", length = 50)
    private String drugForm;

    /** Per-administration amount — "1 tablet", "10ml", "2 puffs". */
    @Column(length = 100)
    private String dose;

    /**
     * Schedule shorthand — OD, BD, TDS, QID, SOS, Q4H, HS, AC, PC, STAT.
     * Stored as an integer FK into {@code prescription_frequencies}; same
     * pattern AppointmentStatus / RoomStatus use.
     */
    @Convert(converter = com.zenlocare.clinics.converter.PrescriptionFrequencyConverter.class)
    @Column(name = "frequency_id")
    private PrescriptionFrequency frequency;

    /** Treatment length in days. Null for SOS / chronic / variable. */
    @Column(name = "duration_days")
    private Integer durationDays;

    /** Total units to dispense — what pharmacy will count out. */
    @Column(nullable = false)
    private Integer quantity;

    /**
     * Route of administration — ORAL, IV, IM, SC, TOPICAL, INHALED, etc.
     * Integer FK into {@code prescription_routes}.
     */
    @Convert(converter = com.zenlocare.clinics.converter.PrescriptionRouteConverter.class)
    @Column(name = "route_id")
    private PrescriptionRoute route;

    /** Free-text per-drug notes ("after meals", "with milk", "taper over 5 days"). */
    @Column(columnDefinition = "TEXT")
    private String instructions;

    /** Order in which the drugs appear on the printed prescription. */
    @Column(name = "display_order")
    @Builder.Default
    private Integer displayOrder = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    /**
     * Running tally of units pharmacy has actually issued against the
     * prescribed quantity. Walks up monotonically per dispense callback
     * until it equals quantity (then dispenseStatus flips to DISPENSED).
     * Defaults to zero at insert via @Builder.Default + column default so
     * older rows backfill cleanly when the migration adds the column.
     */
    @Column(name = "dispensed_qty", nullable = false, columnDefinition = "INTEGER DEFAULT 0")
    @Builder.Default
    private Integer dispensedQty = 0;

    /**
     * Coarse status the pharmacy queue uses for filtering: PENDING (no
     * units dispensed yet), PARTIAL (some but < quantity), DISPENSED
     * (everything issued). Updated atomically with dispensedQty in the
     * dispense callback so the two never drift.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "dispense_status", nullable = false, length = 20,
            columnDefinition = "VARCHAR(20) DEFAULT 'PENDING'")
    @Builder.Default
    private PrescriptionDispenseStatus dispenseStatus = PrescriptionDispenseStatus.PENDING;

    /** Reason if marked NOT_DISPENSED. Null if dispensed or pending. */
    @Column(name = "not_dispensed_reason", length = 255)
    private String notDispensedReason;

    /**
     * Order lifecycle state. ACTIVE = being administered; STOPPED = doctor has
     * discontinued the drug. A stopped order is never deleted — MAR rows reference
     * it via FK (order_id) and must stay intact for medico-legal audit purposes.
     * DEFAULT 'ACTIVE' in the column definition backfills all pre-migration rows.
     */
    @Column(name = "status", nullable = false, length = 16,
            columnDefinition = "VARCHAR(16) DEFAULT 'ACTIVE'")
    @Builder.Default
    private String status = "ACTIVE";

    /** Timestamp when a doctor stopped this order. Null while ACTIVE. */
    @Column(name = "stopped_at")
    private LocalDateTime stoppedAt;

    /** The doctor who stopped the order. Null while ACTIVE. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "stopped_by")
    private User stoppedBy;

    /** Free-text clinical reason for stopping (required by the stop endpoint). */
    @Column(name = "stop_reason", columnDefinition = "TEXT")
    private String stopReason;

    /** Free-text reason recorded when the prescriber overrode a recorded drug allergy for this item. Null = no allergy conflict at prescribe time. */
    @Column(name = "allergy_override_reason", columnDefinition = "TEXT")
    private String allergyOverrideReason;

    /**
     * Running tally of units returned from ward to pharmacy. Effective dispense
     * is {@code dispensedQty - returnedQty}; remaining to dispense is
     * {@code quantity - effectiveDispensed}. Walks up monotonically as pharmacy
     * confirms verified returns. Defaults to 0 at insert via @Builder.Default
     * + column default so older rows backfill cleanly when the migration adds
     * the column.
     *
     * Set optimistically by the nurse-initiated return endpoint and finalized
     * by the pharmacy callback; rolled back on pharmacy reject.
     */
    @Column(name = "returned_qty", nullable = false, columnDefinition = "INTEGER DEFAULT 0")
    @Builder.Default
    private Integer returnedQty = 0;

    /**
     * Optimistic-locking guard: dispense callback, MAR insert, and return
     * mutations race against each other. Every UPDATE bumps this; a stale
     * writer sees the old version and Hibernate throws OptimisticLockException.
     * Nullable for safety while existing rows backfill — Hibernate treats NULL
     * as 0 on the first update (same pattern as Invoice.version).
     */
    @Version
    @Column(name = "version")
    @Builder.Default
    private Long version = 0L;

    /**
     * Drug-switch audit chain. When a doctor stops an order and prescribes a
     * replacement from the same MAR action, the new prescription_items row
     * carries the old order's id here. The OLD order is left STOPPED — this
     * column lives on the NEW row only — so the chain reads forward:
     *   oldOrder.id  ←  newOrder.replacesPrescriptionItemId
     * Inverse "this order was replaced by …" is a single SELECT against the
     * column (see PrescriptionItemRepository.findReplacementsByOldItemIds).
     *
     * Soft FK (no @ManyToOne) so a stopped order can never be hard-deleted
     * because something references it — it should never be deleted anyway
     * (medico-legal audit), but the soft pointer keeps the schema additive
     * and the migration idempotent.
     */
    @Column(name = "replaces_prescription_item_id")
    private UUID replacesPrescriptionItemId;

    /** Net units actually with the patient/ward (dispensed minus returned). */
    @jakarta.persistence.Transient
    public int getEffectiveDispensedQty() {
        int d = dispensedQty != null ? dispensedQty : 0;
        int r = returnedQty   != null ? returnedQty   : 0;
        return Math.max(0, d - r);
    }
}
