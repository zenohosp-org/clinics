package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Single lookup table for every "type" / "status" field the blood-bank
 * domain needs — blood groups, components, unit statuses, donor types,
 * source types. Same shape as RoomTypeConfig but unified via a
 * lookupType discriminator so we don't multiply boilerplate.
 *
 * Lookup types:
 *   BLOOD_GROUP     → A_POS, A_NEG, B_POS, B_NEG, AB_POS, AB_NEG, O_POS, O_NEG
 *   COMPONENT       → WHOLE_BLOOD, PRBC, FFP, PLATELETS_RDP, PLATELETS_SDP, CRYO
 *                     (metadata.shelfLifeDays drives auto-expiry on bag intake)
 *   UNIT_STATUS     → QUARANTINE, AVAILABLE, RESERVED, ISSUED, EXPIRED, DISCARDED
 *                     (metadata.color drives the badge tone in the UI)
 *   DONOR_TYPE      → VOLUNTARY, REPLACEMENT, AUTOLOGOUS, FAMILY, PAID
 *   SOURCE_TYPE     → IN_HOUSE_DONOR, EXTERNAL_PURCHASE
 *
 * hospital_id NULL = system default available to every hospital.
 * Non-null = hospital-specific extension / override.
 */
@Entity
@Table(name = "blood_bank_lookups",
       uniqueConstraints = @UniqueConstraint(
               name = "uniq_blood_bank_lookups_tenant",
               columnNames = {"hospital_id", "lookup_type", "code"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BloodBankLookup {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id")
    private Hospital hospital;

    @Column(name = "lookup_type", nullable = false, length = 24)
    private String lookupType;

    @Column(nullable = false, length = 40)
    private String code;

    @Column(nullable = false, length = 120)
    private String label;

    /** Free-form JSON for type-specific config (shelfLifeDays, color, etc.). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String metadata;

    @Column(name = "display_order")
    @Builder.Default
    private Integer displayOrder = 0;

    @Column(name = "is_system")
    @Builder.Default
    private Boolean isSystem = false;

    @Column(name = "is_active")
    @Builder.Default
    private Boolean isActive = true;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
