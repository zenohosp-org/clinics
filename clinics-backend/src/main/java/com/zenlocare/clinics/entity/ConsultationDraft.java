package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * In-flight consultation that hasn't been finalised yet. Created when the
 * doctor opens the consultation modal after check-in; debounced upserts keep
 * the row in sync with the unsaved form state. Cleared once the doctor saves
 * the consultation as a patient_record. Survives tab close, browser refresh,
 * and device hop because we don't trust localStorage for clinical state.
 *
 * appointment_id is UNIQUE — one in-flight draft per appointment, matching
 * the one-modal-per-row UX. payload holds the modal's serialised form state
 * as JSON (notes, instructions, prescription rows, next-visit date).
 */
@Entity
@Table(name = "consultation_drafts", uniqueConstraints = @UniqueConstraint(columnNames = "appointment_id"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ConsultationDraft {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "appointment_id", nullable = false, unique = true)
    private UUID appointmentId;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    @Column(name = "patient_id", nullable = false)
    private Integer patientId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String payload;

    @Builder.Default
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Builder.Default
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
