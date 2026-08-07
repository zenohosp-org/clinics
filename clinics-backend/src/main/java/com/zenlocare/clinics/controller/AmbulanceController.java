package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.*;
import com.zenlocare.clinics.repository.*;
import com.zenlocare.clinics.service.InvoiceService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/ambulance")
@RequiredArgsConstructor
public class AmbulanceController {

    private final AmbulanceBookingRepository bookingRepo;
    private final AmbulanceTypeRepository typeRepo;
    private final AmbulanceVehicleRepository vehicleRepo;
    private final HospitalRepository hospitalRepo;
    private final PatientRepository patientRepo;
    private final InvoiceService invoiceService;

    // ── Types ──────────────────────────────────────────────────────────────

    @GetMapping("/types")
    public ResponseEntity<List<AmbulanceType>> getTypes(@RequestParam UUID hospitalId) {
        return ResponseEntity.ok(typeRepo.findByHospitalIdAndActiveTrue(hospitalId));
    }

    @PostMapping("/types")
    public ResponseEntity<AmbulanceType> createType(@RequestParam UUID hospitalId,
                                                     @RequestBody TypeRequest req) {
        AmbulanceType type = AmbulanceType.builder()
                .hospitalId(hospitalId)
                .name(req.getName())
                .defaultCharge(req.getDefaultCharge())
                .active(true)
                .build();
        return ResponseEntity.ok(typeRepo.save(type));
    }

    @DeleteMapping("/types/{id}")
    public ResponseEntity<Void> deleteType(@PathVariable Long id) {
        typeRepo.findById(id).ifPresent(t -> {
            t.setActive(false);
            typeRepo.save(t);
        });
        return ResponseEntity.ok().build();
    }

    // ── Vehicles ──────────────────────────────────────────────────────────

    @GetMapping("/vehicles")
    public ResponseEntity<List<AmbulanceVehicle>> getVehicles(@RequestParam UUID hospitalId) {
        return ResponseEntity.ok(vehicleRepo.findByHospital_IdOrderByCreatedAtDesc(hospitalId));
    }

    @GetMapping("/vehicles/available")
    public ResponseEntity<List<AmbulanceVehicle>> getAvailableVehicles(@RequestParam UUID hospitalId) {
        return ResponseEntity.ok(vehicleRepo.findByHospital_IdAndStatusOrderByVehicleNumberAsc(hospitalId, AmbulanceVehicleStatus.AVAILABLE));
    }

    @PostMapping("/vehicles")
    public ResponseEntity<AmbulanceVehicle> createVehicle(@RequestParam UUID hospitalId,
                                                           @RequestBody VehicleRequest req) {
        Hospital hospital = hospitalRepo.getReferenceById(hospitalId);
        AmbulanceType type = req.getAmbulanceTypeId() != null
                ? typeRepo.findById(req.getAmbulanceTypeId()).orElse(null) : null;
        AmbulanceVehicle vehicle = AmbulanceVehicle.builder()
                .hospital(hospital)
                .vehicleNumber(req.getVehicleNumber())
                .vehicleName(req.getVehicleName())
                .ambulanceType(type)
                .defaultCharge(req.getDefaultCharge())
                .status(AmbulanceVehicleStatus.AVAILABLE)
                .notes(req.getNotes())
                .build();
        return ResponseEntity.ok(vehicleRepo.save(vehicle));
    }

    @PutMapping("/vehicles/{id}")
    public ResponseEntity<AmbulanceVehicle> updateVehicle(@PathVariable Long id,
                                                           @RequestBody VehicleRequest req) {
        return vehicleRepo.findById(id).map(v -> {
            AmbulanceType type = req.getAmbulanceTypeId() != null
                    ? typeRepo.findById(req.getAmbulanceTypeId()).orElse(null) : null;
            v.setVehicleNumber(req.getVehicleNumber());
            v.setVehicleName(req.getVehicleName());
            v.setAmbulanceType(type);
            v.setDefaultCharge(req.getDefaultCharge());
            v.setNotes(req.getNotes());
            return ResponseEntity.ok(vehicleRepo.save(v));
        }).orElse(ResponseEntity.notFound().build());
    }

    @PatchMapping("/vehicles/{id}/status")
    public ResponseEntity<AmbulanceVehicle> updateVehicleStatus(@PathVariable Long id,
                                                                  @RequestBody Map<String, String> body) {
        return vehicleRepo.findById(id).map(v -> {
            v.setStatus(AmbulanceVehicleStatus.valueOf(body.get("status")));
            return ResponseEntity.ok(vehicleRepo.save(v));
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/vehicles/{id}")
    public ResponseEntity<Void> deleteVehicle(@PathVariable Long id) {
        vehicleRepo.deleteById(id);
        return ResponseEntity.ok().build();
    }

    // ── Bookings ──────────────────────────────────────────────────────────

    @GetMapping("/bookings")
    public ResponseEntity<List<AmbulanceBooking>> getBookings(
            @RequestParam UUID hospitalId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String date) {
        if (status != null && !status.isEmpty()) {
            return ResponseEntity.ok(bookingRepo.findByHospital_IdAndStatusOrderByCreatedAtDesc(
                    hospitalId, AmbulanceBookingStatus.valueOf(status)));
        }
        if (date != null && !date.isEmpty()) {
            return ResponseEntity.ok(bookingRepo.findByHospital_IdAndBookingDateOrderByBookingTimeAsc(
                    hospitalId, LocalDate.parse(date)));
        }
        return ResponseEntity.ok(bookingRepo.findByHospital_IdOrderByCreatedAtDesc(hospitalId));
    }

    @Transactional
    @PostMapping("/bookings")
    public ResponseEntity<AmbulanceBooking> createBooking(@RequestParam UUID hospitalId,
                                                           @RequestBody BookingRequest req) {
        // Use findById (not getReferenceById) — we need real address/city fields
        // for isSameHospitalByAddress. A proxy would lazy-load them and throw
        // LazyInitializationException once this handler's session closes.
        Hospital hospital = hospitalRepo.findById(hospitalId)
                .orElseThrow(() -> new IllegalArgumentException("Hospital not found: " + hospitalId));
        Patient patient = req.getPatientId() != null ? patientRepo.findById(req.getPatientId()).orElse(null) : null;
        AmbulanceType type = req.getAmbulanceTypeId() != null ? typeRepo.findById(req.getAmbulanceTypeId()).orElse(null) : null;
        AmbulanceVehicle vehicle = req.getVehicleId() != null ? vehicleRepo.findById(req.getVehicleId()).orElse(null) : null;

        BigDecimal charge = req.getCharge() != null ? req.getCharge()
                : (vehicle != null ? vehicle.getDefaultCharge() : null);
        String vehicleNumber = vehicle != null ? vehicle.getVehicleNumber() : req.getVehicleNumber();
        if (type == null && vehicle != null) type = vehicle.getAmbulanceType();

        AmbulanceBooking booking = AmbulanceBooking.builder()
                .hospital(hospital)
                .patient(patient)
                .bookingDate(LocalDate.parse(req.getBookingDate()))
                .bookingTime(LocalTime.parse(req.getBookingTime()))
                .pickupAddress(req.getPickupAddress())
                .destinationAddress(req.getDestinationAddress())
                .ambulanceType(type)
                .vehicle(vehicle)
                .charge(charge)
                .paymentStatus(req.getPaymentStatus() != null ? req.getPaymentStatus() : "UNPAID")
                .status(AmbulanceBookingStatus.PENDING)
                .driverName(req.getDriverName())
                .driverPhone(req.getDriverPhone())
                .driverLicense(req.getDriverLicense())
                .vehicleNumber(vehicleNumber)
                .notes(req.getNotes())
                .reachedToSameHospital(isSameHospitalByAddress(hospital, req.getDestinationAddress()))
                .build();

        return ResponseEntity.ok(bookingRepo.save(booking));
    }

    @Transactional
    @PatchMapping("/bookings/{id}/status")
    public ResponseEntity<AmbulanceBooking> updateStatus(@PathVariable Long id,
                                                          @RequestBody Map<String, String> body) {
        return bookingRepo.findById(id).map(b -> {
            // Body may contain only `paymentStatus` (e.g. ambulance billing's
            // "Mark as Paid" action) — don't NPE when `status` is absent.
            String statusStr = body.get("status");
            AmbulanceBookingStatus newStatus = (statusStr != null && !statusStr.isBlank())
                    ? AmbulanceBookingStatus.valueOf(statusStr)
                    : b.getStatus();
            b.setStatus(newStatus);
            if (body.containsKey("paymentStatus")) b.setPaymentStatus(body.get("paymentStatus"));

            if (statusStr != null && b.getVehicle() != null) {
                if (newStatus == AmbulanceBookingStatus.DISPATCHED || newStatus == AmbulanceBookingStatus.EN_ROUTE) {
                    b.getVehicle().setStatus(AmbulanceVehicleStatus.IN_USE);
                    vehicleRepo.save(b.getVehicle());
                } else if (newStatus == AmbulanceBookingStatus.COMPLETED || newStatus == AmbulanceBookingStatus.CANCELLED) {
                    b.getVehicle().setStatus(AmbulanceVehicleStatus.AVAILABLE);
                    vehicleRepo.save(b.getVehicle());
                }
            }

            // Auto-merge ambulance charge to patient's IPD invoice when completed
            // and destination was flagged as this same hospital.
            //
            // CRITICAL: only mark mergedToIpd=TRUE when the merge actually happened.
            // If the patient has no active IPD invoice yet (e.g., trip completes BEFORE
            // admission), addAmbulanceItemToIpdInvoice returns false. Marking the booking
            // as merged anyway would cause the admit-time auto-merge to skip it later —
            // the ambulance charge would never reach the IPD bill.
            boolean isSameHospital = Boolean.TRUE.equals(b.getReachedToSameHospital());
            if (newStatus == AmbulanceBookingStatus.COMPLETED
                    && isSameHospital
                    && b.getPatient() != null
                    && !Boolean.TRUE.equals(b.getMergedToIpd())) {
                try {
                    String vehicleDesc = b.getVehicle() != null ? b.getVehicle().getVehicleNumber() : b.getVehicleNumber();
                    String typeDesc    = b.getAmbulanceType() != null ? b.getAmbulanceType().getName() : "Ambulance";
                    String description = typeDesc + (vehicleDesc != null ? " (" + vehicleDesc + ")" : "");
                    boolean added = invoiceService.addAmbulanceItemToIpdInvoice(
                            b.getPatient().getId(), b.getId(), b.getCharge(), description);
                    if (added) b.setMergedToIpd(true);
                    // else: leave mergedToIpd as-is — admit-time merge will pick it up
                    // when the patient is actually admitted.
                } catch (Exception ignored) {
                    // Non-fatal: billing staff can add manually if auto-merge fails
                }
            }

            return ResponseEntity.ok(bookingRepo.save(b));
        }).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/bookings/{id}")
    public ResponseEntity<AmbulanceBooking> updateBooking(@PathVariable Long id,
                                                           @RequestBody BookingRequest req) {
        return bookingRepo.findById(id).map(b -> {
            if (req.getPatientId() != null) b.setPatient(patientRepo.findById(req.getPatientId()).orElse(null));
            if (req.getAmbulanceTypeId() != null) b.setAmbulanceType(typeRepo.findById(req.getAmbulanceTypeId()).orElse(null));
            if (req.getVehicleId() != null) {
                AmbulanceVehicle v = vehicleRepo.findById(req.getVehicleId()).orElse(null);
                b.setVehicle(v);
                if (v != null) b.setVehicleNumber(v.getVehicleNumber());
            }
            if (req.getBookingDate() != null) b.setBookingDate(LocalDate.parse(req.getBookingDate()));
            if (req.getBookingTime() != null) b.setBookingTime(LocalTime.parse(req.getBookingTime()));
            b.setPickupAddress(req.getPickupAddress());
            b.setDestinationAddress(req.getDestinationAddress());
            b.setCharge(req.getCharge());
            if (req.getPaymentStatus() != null) b.setPaymentStatus(req.getPaymentStatus());
            if (req.getStatus() != null) b.setStatus(AmbulanceBookingStatus.valueOf(req.getStatus()));
            b.setDriverName(req.getDriverName());
            b.setDriverPhone(req.getDriverPhone());
            if (req.getDriverLicense() != null) b.setDriverLicense(req.getDriverLicense());
            if (req.getVehicleId() == null && req.getVehicleNumber() != null) b.setVehicleNumber(req.getVehicleNumber());
            b.setNotes(req.getNotes());
            // Recompute from address whenever destination changes; fallback to request value
            if (req.getDestinationAddress() != null) {
                b.setReachedToSameHospital(isSameHospitalByAddress(b.getHospital(), req.getDestinationAddress()));
            } else if (req.getReachedToSameHospital() != null) {
                b.setReachedToSameHospital(req.getReachedToSameHospital());
            }

            AmbulanceBooking saved = bookingRepo.save(b);

            // Emergency flow: ambulance often gets COMPLETED before a Patient
            // record exists — driver brings in an unidentified patient, status
            // flips to COMPLETED, then staff register the patient and edit the
            // booking to assign patient_id. updateStatus' merge skipped because
            // patient was null at that moment; without retrying here, the
            // ambulance line never reaches the IPD bill.
            //
            // Try the merge at the end of the update too. addAmbulanceItemToIpdInvoice
            // is idempotent (no-op if booking already linked to an invoice item)
            // and returns false when there's no active IPD invoice yet — in which
            // case we DON'T flip mergedToIpd, so admit() will pick it up.
            if (saved.getPatient() != null
                    && saved.getStatus() == AmbulanceBookingStatus.COMPLETED
                    && saved.getCharge() != null
                    && saved.getCharge().signum() > 0
                    && !Boolean.TRUE.equals(saved.getMergedToIpd())) {
                try {
                    String vehicleDesc = saved.getVehicle() != null ? saved.getVehicle().getVehicleNumber() : saved.getVehicleNumber();
                    String typeDesc    = saved.getAmbulanceType() != null ? saved.getAmbulanceType().getName() : "Ambulance";
                    String description = typeDesc + (vehicleDesc != null ? " (" + vehicleDesc + ")" : "");
                    boolean added = invoiceService.addAmbulanceItemToIpdInvoice(
                            saved.getPatient().getId(), saved.getId(), saved.getCharge(), description);
                    if (added) {
                        saved.setMergedToIpd(true);
                        bookingRepo.save(saved);
                    }
                } catch (Exception ignored) {
                    // Non-fatal — admit-time auto-merge will retry, or staff can add manually.
                }
            }
            return ResponseEntity.ok(saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/bookings/{id}")
    public ResponseEntity<Void> deleteBooking(@PathVariable Long id) {
        bookingRepo.deleteById(id);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/bookings/by-patient/{patientId}")
    public ResponseEntity<List<AmbulanceBooking>> getByPatient(
            @PathVariable Integer patientId,
            @RequestParam UUID hospitalId) {
        return ResponseEntity.ok(bookingRepo.findByPatient_IdAndHospital_Id(patientId, hospitalId));
    }

    @Transactional
    @PatchMapping("/{id}/merge-ipd")
    public ResponseEntity<Void> mergeToIpd(@PathVariable Long id) {
        bookingRepo.findById(id).ifPresent(b -> {
            b.setMergedToIpd(true);
            bookingRepo.save(b);
        });
        return ResponseEntity.ok().build();
    }

    @GetMapping("/hospital-info")
    public ResponseEntity<Map<String, String>> getHospitalInfo(@RequestParam UUID hospitalId) {
        return hospitalRepo.findById(hospitalId).map(h -> {
            Map<String, String> info = new HashMap<>();
            info.put("name",    h.getName()    != null ? h.getName()    : "");
            info.put("address", h.getAddress() != null ? h.getAddress() : "");
            info.put("city",    h.getCity()    != null ? h.getCity()    : "");
            info.put("state",   h.getState()   != null ? h.getState()   : "");
            return ResponseEntity.ok(info);
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Long>> getStats(@RequestParam UUID hospitalId) {
        // `total` excludes CANCELLED so the dashboard count reflects active workload
        // rather than every booking that ever existed. Also a COUNT query instead
        // of loading the whole booking list into memory.
        long total = bookingRepo.countActiveByHospitalId(hospitalId);
        long pending = bookingRepo.countByHospital_IdAndStatus(hospitalId, AmbulanceBookingStatus.PENDING);
        long today = bookingRepo.countByHospitalIdAndDate(hospitalId, LocalDate.now());
        long completed = bookingRepo.countByHospital_IdAndStatus(hospitalId, AmbulanceBookingStatus.COMPLETED);
        return ResponseEntity.ok(Map.of("total", total, "pending", pending, "today", today, "completed", completed));
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private boolean isSameHospitalByAddress(Hospital hospital, String destinationAddress) {
        if (hospital == null || destinationAddress == null || destinationAddress.isBlank()) return false;
        String dest = destinationAddress.toLowerCase().trim();
        String hospAddr = hospital.getAddress() != null ? hospital.getAddress().toLowerCase().trim() : "";
        String hospCity = hospital.getCity() != null ? hospital.getCity().toLowerCase().trim() : "";
        return (!hospAddr.isEmpty() && dest.contains(hospAddr)) ||
               (!hospCity.isEmpty() && dest.contains(hospCity));
    }

    // ── DTOs ──────────────────────────────────────────────────────────────

    @Data
    public static class TypeRequest {
        private String name;
        private BigDecimal defaultCharge;
    }

    @Data
    public static class VehicleRequest {
        private String vehicleNumber;
        private String vehicleName;
        private Long ambulanceTypeId;
        private BigDecimal defaultCharge;
        private String notes;
    }

    @Data
    public static class BookingRequest {
        private Integer patientId;
        private String bookingDate;
        private String bookingTime;
        private String pickupAddress;
        private String destinationAddress;
        private Long ambulanceTypeId;
        private Long vehicleId;
        private BigDecimal charge;
        private String paymentStatus;
        private String status;
        private String driverName;
        private String driverPhone;
        private String driverLicense;
        private String vehicleNumber;
        private String notes;
        private Boolean reachedToSameHospital;
    }
}
