package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One daily collection entry of bio-medical waste, by category and
 * generation point (BMWM Rules 2016 Schedule I/II).
 *
 * {@code handover IS NULL} ⇒ still pending handover to a disposal vendor.
 * Once linked to a {@link BiomedicalWasteHandover}, the entry is locked
 * (cannot be edited or deleted).
 */
@Entity
@Table(name = "biomedical_waste_logs",
       indexes = {
           @Index(name = "idx_bmw_logs_hospital", columnList = "hospital_id"),
           @Index(name = "idx_bmw_logs_date", columnList = "log_date"),
           @Index(name = "idx_bmw_logs_category", columnList = "category_code"),
           @Index(name = "idx_bmw_logs_handover", columnList = "handover_id")
       })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BiomedicalWasteLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    private Hospital hospital;

    @Column(name = "log_date", nullable = false)
    private LocalDate logDate;

    @Column(name = "category_code", nullable = false, length = 40)
    private String categoryCode;

    @Column(name = "generation_point_code", nullable = false, length = 40)
    private String generationPointCode;

    @Column(name = "weight_kg", nullable = false, precision = 8, scale = 2)
    private BigDecimal weightKg;

    @Column(name = "bag_count")
    private Integer bagCount;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "collected_by_user_id")
    private User collectedByUser;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "handover_id")
    private BiomedicalWasteHandover handover;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
