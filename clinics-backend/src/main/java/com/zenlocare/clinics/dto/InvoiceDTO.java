package com.zenlocare.clinics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InvoiceDTO {
    private String id;
    private String invoiceNumber;
    private Integer patientId;
    private String patientName;
    private String patientUhid;
    private UUID admissionId;
    private String admissionNumber;
    private UUID appointmentId;
    private LocalDateTime appointmentDate;
    private String appointmentDoctorName;
    private String bookedBy;
    private String appointmentType;
    private Integer appointmentTokenNumber;
    private String appointmentStatus;
    private String appointmentChiefComplaint;
    private String appointmentCancelledReason;
    private BigDecimal subtotal;
    private BigDecimal tax;
    private BigDecimal discount;
    private BigDecimal total;
    private String paymentMethod;
    private String notes;
    private String status;
    private BigDecimal advanceAdjusted;
    private BigDecimal paidAmount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private UUID updatedById;
    private String updatedByName;
    private List<ItemDTO> items;
    private List<PaymentDTO> payments;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PaymentDTO {
        private UUID id;
        private BigDecimal amount;
        private String paymentMethod;
        private String collectedBy;
        private UUID collectedById;
        private String collectedByName;
        private LocalDateTime paidAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ItemDTO {
        private UUID id;
        private String itemType;
        private String description;
        private Integer quantity;
        private BigDecimal unitPrice;
        private BigDecimal totalPrice;
        private BigDecimal waiverAmount;
        private String waiverReason;
        private UUID serviceId;
        private Long radiologyOrderId;
        private UUID appointmentId;
        private Long ambulanceBookingId;
        // FK to api-pharmacy pharmacy_bills.id. Set on MEDICINE rows pulled
        // from the pharmacy service; null for everything else. Lets the
        // finalize modal dedupe across reloads without comparing drug names.
        private UUID pharmacyBillId;
        // FK to OTM ot_bookings.id this charge originated from. Null for non-OT rows.
        private UUID otBookingId;
        // FK to OTM ot_invoice_items.id. Stable per-line UUID used by the
        // finalize modal to dedupe across reloads even when descriptions are
        // edited. Null for non-OT rows and for legacy OT rows persisted before
        // this field existed.
        private UUID otInvoiceItemId;
    }
}
