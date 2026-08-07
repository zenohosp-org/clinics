package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@Entity
@Table(name = "rooms", uniqueConstraints = @UniqueConstraint(columnNames = { "hospital_id", "room_number" }))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Room {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "room_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    @JsonIgnore
    private Hospital hospital;

    @Column(name = "room_number", nullable = false, length = 20)
    private String roomNumber;

    @Column(name = "room_code", length = 20, unique = true)
    private String roomCode;

    @Column(name = "room_type", nullable = false, length = 30)
    private String roomType;

    @Column(name = "is_under_maintenance")
    @Builder.Default
    private boolean isUnderMaintenance = false;

    @Column(name = "price_per_day", precision = 10, scale = 2)
    private java.math.BigDecimal pricePerDay;

    // attender_* columns were removed — attender now lives on Admission.
    // The DB columns are dropped by DataSeeder on startup; the field-less
    // entity here means Hibernate stops reading/writing them.

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ward_id")
    @JsonIgnore
    private HospitalWard hospitalWard;

    // Optimistic-lock cursor — concurrent allocations / status flips against
    // the same room (e.g. two admits racing for the last AVAILABLE room) will
    // see one commit and the other throw OptimisticLockException → HTTP 409.
    @jakarta.persistence.Version
    @Column(name = "version")
    @Builder.Default
    private Long version = 0L;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "is_active")
    @Builder.Default
    private Boolean isActive = true;

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
