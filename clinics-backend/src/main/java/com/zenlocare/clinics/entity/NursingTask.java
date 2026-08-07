package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One nursing task for an IPD admission.
 *
 * category: MEDICATION | WOUND_CARE | VITALS | HYGIENE | MOBILITY | IV_LINE | OTHER
 * shift:    MORNING | AFTERNOON | NIGHT | ANY
 * status:   PENDING | DONE | SKIPPED
 */
@Entity
@Table(
    name = "nursing_tasks",
    indexes = @Index(name = "idx_nursing_tasks_admission",
                     columnList = "admission_id, created_at DESC")
)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class NursingTask {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "admission_id", nullable = false)
    private UUID admissionId;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    @Column(name = "task_name", nullable = false, length = 255)
    private String taskName;

    @Column(name = "category", nullable = false, length = 20)
    @Builder.Default
    private String category = "OTHER";

    @Column(name = "shift", nullable = false, length = 12)
    @Builder.Default
    private String shift = "ANY";

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "status", nullable = false, length = 10)
    @Builder.Default
    private String status = "PENDING";

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "completed_by")
    private User completedBy;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
