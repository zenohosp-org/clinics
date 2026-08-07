package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One batch of bio-medical waste handed over to an authorized disposal
 * vendor / Common Treatment Facility (CTF), per BMWM Rules 2016 manifest
 * requirements. Created by selecting a set of pending
 * {@link BiomedicalWasteLog} entries, which then link back here.
 */
@Entity
@Table(name = "biomedical_waste_handovers",
       indexes = {
           @Index(name = "idx_bmw_handovers_hospital", columnList = "hospital_id"),
           @Index(name = "idx_bmw_handovers_date", columnList = "handover_date")
       })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BiomedicalWasteHandover {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    private Hospital hospital;

    @Column(name = "handover_date", nullable = false)
    private LocalDate handoverDate;

    @Column(name = "vendor_name", nullable = false, length = 150)
    private String vendorName;

    @Column(name = "manifest_number", length = 80)
    private String manifestNumber;

    @Column(name = "vehicle_number", length = 40)
    private String vehicleNumber;

    @Column(name = "received_by_name", length = 120)
    private String receivedByName;

    @Column(name = "total_weight_kg", precision = 10, scale = 2)
    private BigDecimal totalWeightKg;

    /** Amount paid/payable to the vendor/CTF for this handover. */
    @Column(name = "cost_amount", precision = 10, scale = 2)
    private BigDecimal costAmount;

    @Column(name = "invoice_number", length = 80)
    private String invoiceNumber;

    /** Category code → total kg for this handover. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "category_breakdown", columnDefinition = "jsonb")
    private String categoryBreakdown;

    @Column(columnDefinition = "text")
    private String notes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id")
    private User createdByUser;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
