package com.zenlocare.clinics.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.util.UUID;

@Entity
@Table(name = "ot_bookings")
@Data
public class OtBooking {
    @Id
    private UUID id;
    private Long roomId;
    private String status;
}
