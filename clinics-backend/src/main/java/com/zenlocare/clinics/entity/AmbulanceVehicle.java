package com.zenlocare.clinics.entity;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "ambulance_vehicles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AmbulanceVehicle {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Hospital hospital;

    @Column(name = "vehicle_number", nullable = false, length = 30)
    private String vehicleNumber;

    @Column(name = "vehicle_name", length = 100)
    private String vehicleName;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "ambulance_type_id")
    private AmbulanceType ambulanceType;

    @Column(name = "default_charge", precision = 10, scale = 2)
    private BigDecimal defaultCharge;

    @Convert(converter = com.zenlocare.clinics.converter.AmbulanceVehicleStatusConverter.class)
    @Column(name = "status_id")
    @Builder.Default
    private AmbulanceVehicleStatus status = AmbulanceVehicleStatus.AVAILABLE;

    @Column(columnDefinition = "TEXT")
    private String notes;

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
