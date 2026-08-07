package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * A third party that settles patient invoices: a TPA, insurer, corporate
 * panel or government scheme. Master data for the insurance-claims flow;
 * one row per payer per hospital.
 */
@Entity
@Table(name = "payers", indexes = {
    @Index(name = "idx_payers_hospital_id", columnList = "hospital_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Payer {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    @Column(nullable = false, length = 150)
    private String name;

    // TPA | INSURER | CORPORATE | GOVT_SCHEME
    @Column(nullable = false, length = 20)
    private String type;

    @Column(name = "contact_person", length = 100)
    private String contactPerson;

    @Column(length = 20)
    private String phone;

    @Column(length = 150)
    private String email;

    @Column(columnDefinition = "TEXT")
    private String address;

    // Soft-delete flag; inactive payers are hidden from pickers but keep history.
    @Column(name = "is_active")
    @Builder.Default
    private Boolean isActive = true;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
