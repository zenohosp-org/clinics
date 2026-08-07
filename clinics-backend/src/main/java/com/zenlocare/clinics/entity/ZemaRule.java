package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "zema_rules")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ZemaRule {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "rule_id")
    private UUID ruleId;

    /** Null = system-wide default available to all hospitals */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id")
    private Hospital hospital;

    @Column(name = "rule_type", nullable = false, length = 20)
    private String ruleType; // 'single' | 'combination'

    @Column(name = "metric", length = 50)
    private String metric; // 'bmi', 'bp', 'spo2', etc.

    @Column(name = "operator", length = 20)
    private String operator; // 'lt', 'lte', 'gt', 'gte', 'between', 'eq'

    @Column(name = "threshold_low", precision = 10, scale = 2)
    private BigDecimal thresholdLow;

    @Column(name = "threshold_high", precision = 10, scale = 2)
    private BigDecimal thresholdHigh;

    @Column(name = "condition_expr", columnDefinition = "TEXT")
    private String conditionExpr;

    @Column(name = "label", nullable = false, length = 100)
    private String label;

    @Column(name = "output_text", nullable = false, columnDefinition = "TEXT")
    private String outputText;

    @Column(name = "severity", nullable = false, length = 20)
    private String severity; // 'critical' | 'warning' | 'info' | 'reassurance'

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;

    @Column(name = "sort_hint")
    private Integer sortHint;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
