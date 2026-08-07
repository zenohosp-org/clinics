package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Single lookup table for the bio-medical-waste domain's "type" fields —
 * mirrors {@link BloodBankLookup}'s shape and conventions.
 *
 * Lookup types:
 *   WASTE_CATEGORY    → YELLOW, RED, WHITE, BLUE (BMWM Rules 2016 Schedule I
 *                       color codes; metadata.color drives the UI chip color)
 *   GENERATION_POINT  → OT, ICU, GENERAL_WARD, LABOUR_ROOM, LABORATORY, OPD,
 *                       PHARMACY, DIALYSIS, EMERGENCY, ISOLATION
 *
 * hospital_id NULL = system default available to every hospital.
 * Non-null = hospital-specific extension / override.
 */
@Entity
@Table(name = "biomedical_waste_lookups",
       uniqueConstraints = @UniqueConstraint(
               name = "uniq_biomedical_waste_lookups_tenant",
               columnNames = {"hospital_id", "lookup_type", "code"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BiomedicalWasteLookup {

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

    /** Free-form JSON for type-specific config (color, treatment, etc.). */
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
