package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonBackReference;
import java.util.UUID;
import java.math.BigDecimal;

@Entity
@Table(name = "invoice_items")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InvoiceItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invoice_id", nullable = false)
    @JsonBackReference
    private Invoice invoice;

    @Column(name = "service_id")
    private UUID serviceId;

    @Column(name = "radiology_order_id")
    private Long radiologyOrderId;

    @Column(name = "appointment_id")
    private UUID appointmentId;

    @Column(name = "ambulance_booking_id")
    private Long ambulanceBookingId;

    // FK back to api-pharmacy.zenohosp.com pharmacy_bills.id. Lets the IPD
    // finalize flow dedupe pharmacy bills across reloads without depending on
    // description (drug names repeat across visits). Nullable: non-pharmacy
    // line items leave it empty.
    @Column(name = "pharmacy_bill_id")
    private UUID pharmacyBillId;

    // FK back to the OTM ot_bookings.id this charge originated from. Lets the
    // IPD finalize flow dedupe OT lines by booking when the per-item UUID is
    // absent (e.g. legacy OTM rows). Nullable.
    @Column(name = "ot_booking_id")
    private UUID otBookingId;

    // FK back to the OTM ot_invoice_items.id this charge originated from. The
    // stable per-line identifier the finalize modal uses to dedupe across
    // reloads even when staff edit the description. Nullable for non-OT rows
    // and for legacy OT rows persisted before this field existed.
    @Column(name = "ot_invoice_item_id")
    private UUID otInvoiceItemId;

    @Column(name = "item_type", length = 30)
    private String itemType; // MEDICINE, LAB_TEST, CONSULTATION, ROOM_CHARGE, RADIOLOGY, CUSTOM

    @Column(nullable = false)
    private String description;

    @Column(nullable = false)
    private Integer quantity;

    @Column(name = "unit_price", nullable = false, precision = 10, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "total_price", nullable = false, precision = 10, scale = 2)
    private BigDecimal totalPrice;

    @Column(name = "waiver_amount", precision = 10, scale = 2)
    private BigDecimal waiverAmount;

    @Column(name = "waiver_reason", length = 255)
    private String waiverReason;

    /**
     * When this line was written to the invoice — i.e. the last IPD Finalize
     * (since Finalize clears + re-adds items). Drives the finance
     * {@code /api/finance/returns} feed's time window so the audit list
     * orders by "when did this credit show up on the bill". Nullable for
     * defence in depth (legacy rows pre-migration default to the column-add
     * timestamp via the DB default; new rows pick up via @CreationTimestamp).
     */
    @org.hibernate.annotations.CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private java.time.LocalDateTime createdAt;
}
