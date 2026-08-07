package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "states")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class State {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "state_name", nullable = false, length = 100)
    private String stateName;

    @Column(name = "state_code", nullable = false, length = 5)
    private String stateCode;

    @Column(name = "gstin_code", length = 5)
    private String gstinCode;

    @Column(name = "region", length = 30)
    private String region;

    @Column(name = "is_union_territory")
    private Boolean isUnionTerritory;

    @Column(name = "capital", length = 100)
    private String capital;

    @Column(name = "display_order")
    private Integer displayOrder;

    @Column(name = "is_active")
    private Boolean isActive;
}
