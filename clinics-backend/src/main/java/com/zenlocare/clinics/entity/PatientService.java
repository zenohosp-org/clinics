package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;
import java.math.BigDecimal;

@Entity
@Table(name = "patient_services")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PatientService {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ServiceType type; // FOOD, ROOM_SERVICE, CONVENIENCE, CUSTOM

    @Enumerated(EnumType.STRING)
    @Column(name = "meal_time")
    private MealTime mealTime; // BREAKFAST, LUNCH, DINNER (for FOOD type only)

    @Column(name = "charge_time", length = 5)
    private String chargeTime; // HH:mm — time of day this meal is served, used for exact meal-slot billing

    @Column(name = "price_per_meal", precision = 10, scale = 2)
    private BigDecimal pricePerMeal; // For FOOD services

    @Column(name = "price_per_day", precision = 10, scale = 2)
    private BigDecimal pricePerDay; // For ROOM_SERVICE, CONVENIENCE, CUSTOM services

    @Builder.Default
    @Column(name = "is_active")
    private Boolean isActive = true;

    @Builder.Default
    @Column(name = "one_time_charge")
    private Boolean oneTimeCharge = false;

    @Builder.Default
    @Column(updatable = false, name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    @Builder.Default
    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public enum ServiceType {
        FOOD,
        ROOM_SERVICE,
        CONVENIENCE,
        CUSTOM,
        REGISTRATION
    }

    public enum MealTime {
        BREAKFAST,
        LUNCH,
        DINNER
    }
}
