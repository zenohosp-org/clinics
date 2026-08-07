package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "hospitals")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Hospital {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String subdomain; // "srm" → srm.zenohosp.com

    @Column(nullable = false, unique = true)
    private String code; // "SRM"

    @Column(name = "numeric_code", length = 4, unique = true)
    private String numericCode; // "1001" — prefixed to all generated record IDs for global search

    private String email;
    private String phone;
    private String address;
    private String city;
    private String state;
    private String logoUrl;
    private String description;

    @Builder.Default
    private Boolean isActive = true;

    @Builder.Default
    private Boolean isListed = true; // Show on directory page?

    private String subscriptionPlan;

    /** Window after which pending OPD prescriptions automatically expire to NOT_SOLD. Default 48h. */
    @Builder.Default
    @Column(name = "opd_prescription_expiry_hours")
    private Integer opdPrescriptionExpiryHours = 48;

    @Builder.Default
    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    public void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        normalizeCase();
    }

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = LocalDateTime.now();
        normalizeCase();
    }

    private void normalizeCase() {
        if (code != null) {
            this.code = code.toLowerCase().trim();
        }
        if (subdomain != null) {
            this.subdomain = subdomain.toLowerCase().trim();
        }
    }
}
