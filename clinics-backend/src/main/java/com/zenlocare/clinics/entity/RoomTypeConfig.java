package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "room_type_configs",
       uniqueConstraints = @UniqueConstraint(columnNames = {"hospital_id", "code"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RoomTypeConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Null = system-wide default available to all hospitals */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id")
    private Hospital hospital;

    @Column(nullable = false, length = 30)
    private String code;

    @Column(nullable = false, length = 100)
    private String label;

    /**
     * Drives sync behaviour:
     *   WARD  → standard patient room (IPD)
     *   OT    → syncs to ot.zenohosp.com
     *   STORE → syncs to inventory.zenohosp.com
     *   OTHER → no special sync
     */
    @Column(length = 20)
    @Builder.Default
    private String category = "WARD";

    @Column(length = 50)
    private String icon;

    @Column(length = 20)
    private String color;

    @Column(name = "has_beds")
    @Builder.Default
    private Boolean hasBeds = true;

    @Column(name = "has_daily_charge")
    @Builder.Default
    private Boolean hasDailyCharge = true;

    /**
     * OT-category types only: true = surgeries/procedures can be scheduled in
     * this room (a real operating theatre / procedure room), so it appears in
     * the OT app's booking room picker. false = an OT-area support space
     * (pre-op prep, scrub / sterile corridor) or recovery (POST_OT) that must
     * NOT be bookable for surgery. Ignored for non-OT categories.
     */
    @Column(name = "bookable_ot")
    @Builder.Default
    private Boolean bookableOt = false;

    /** System defaults cannot be deleted by users */
    @Column(name = "is_system")
    @Builder.Default
    private Boolean isSystem = false;

    @Column(name = "is_active")
    @Builder.Default
    private Boolean isActive = true;

    @Column(name = "display_order")
    @Builder.Default
    private Integer displayOrder = 0;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
