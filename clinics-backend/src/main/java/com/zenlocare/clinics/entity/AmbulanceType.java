package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "ambulance_types")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AmbulanceType {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "default_charge", precision = 10, scale = 2)
    private BigDecimal defaultCharge;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
