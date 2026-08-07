package com.zenlocare.clinics.entity;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
@Table(name = "ambulance_bookings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AmbulanceBooking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Hospital hospital;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "patient_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "hospital"})
    private Patient patient;

    @Column(name = "booking_date", nullable = false)
    private LocalDate bookingDate;

    @Column(name = "booking_time", nullable = false)
    private LocalTime bookingTime;

    @Column(name = "pickup_address", columnDefinition = "TEXT")
    private String pickupAddress;

    @Column(name = "destination_address", columnDefinition = "TEXT")
    private String destinationAddress;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "ambulance_type_id")
    private AmbulanceType ambulanceType;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "vehicle_id")
    private AmbulanceVehicle vehicle;

    @Column(precision = 10, scale = 2)
    private BigDecimal charge;

    @Column(name = "payment_status", length = 20)
    @Builder.Default
    private String paymentStatus = "UNPAID";

    @Convert(converter = com.zenlocare.clinics.converter.AmbulanceBookingStatusConverter.class)
    @Column(name = "status_id")
    @Builder.Default
    private AmbulanceBookingStatus status = AmbulanceBookingStatus.PENDING;

    @Column(name = "driver_name", length = 100)
    private String driverName;

    @Column(name = "driver_phone", length = 20)
    private String driverPhone;

    @Column(name = "driver_license", length = 50)
    private String driverLicense;

    @Column(name = "vehicle_number", length = 30)
    private String vehicleNumber;

    @Column(name = "reached_to_same_hospital")
    @Builder.Default
    private Boolean reachedToSameHospital = false;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "merged_to_ipd")
    @Builder.Default
    private Boolean mergedToIpd = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
