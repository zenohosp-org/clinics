package com.zenlocare.clinics.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.util.List;

@Entity
@Table(name = "hospital_wards")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HospitalWard {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "floor_id", nullable = false)
    @JsonIgnore
    private HospitalFloor floor;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id")
    @JsonIgnore
    private Hospital hospital;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "daily_charge", precision = 10, scale = 2)
    private BigDecimal dailyCharge;

    @Column(name = "room_type", length = 30)
    private String roomType;

    @Column(name = "room_count")
    private Integer roomCount;

    @Column(name = "display_order")
    private Integer displayOrder;

    @Column(name = "is_active")
    @Builder.Default
    private Boolean isActive = true;

    @OneToMany(mappedBy = "ward", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Bed> beds;
}
