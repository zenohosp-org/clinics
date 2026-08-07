package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "room_logs")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RoomLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "room_id", nullable = false)
    private Room room;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    private Hospital hospital;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private RoomLogEvent event;

    @Column(name = "room_number", length = 20)
    private String roomNumber;

    @Column(name = "patient_name", length = 200)
    private String patientName;

    @Column(name = "patient_uhid", length = 50)
    private String patientUhid;

    @Column(name = "attender_name", length = 100)
    private String attenderName;

    @Column(name = "allocation_token", length = 30)
    private String allocationToken;

    @Column(name = "performed_by", length = 200)
    private String performedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
