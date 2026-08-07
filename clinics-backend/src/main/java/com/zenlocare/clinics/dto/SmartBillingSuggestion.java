package com.zenlocare.clinics.dto;

import lombok.*;
import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SmartBillingSuggestion {

    private RoomSuggestion roomCharge;
    private List<RadiologySuggestion> radiologyOrders;
    private List<AppointmentSuggestion> appointments;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RoomSuggestion {
        private String roomNumber;
        private String roomType;
        private BigDecimal pricePerDay;
        private long daysStayed;
        private BigDecimal totalCharge;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RadiologySuggestion {
        private Long orderId;
        private String serviceName;
        private String status;
        private String scheduledDate;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AppointmentSuggestion {
        private String appointmentId;
        private String doctorName;
        private String specialization;
        private BigDecimal consultationFee;
        private String apptDate;
    }
}
