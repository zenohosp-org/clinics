package com.zenlocare.clinics.service;

import com.zenlocare.clinics.dto.AppointmentConflictDto;
import com.zenlocare.clinics.dto.AppointmentDto;
import com.zenlocare.clinics.dto.AppointmentRequest;
import com.zenlocare.clinics.entity.*;
import com.zenlocare.clinics.integration.LabsClient;
import com.zenlocare.clinics.integration.dto.LabsCheckupBookingRequest;
import com.zenlocare.clinics.integration.dto.LabsCheckupBookingResponse;
import com.zenlocare.clinics.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class AppointmentService {

        private final AppointmentRepository appointmentRepository;
        private final HospitalRepository hospitalRepository;
        private final PatientRepository patientRepository;
        private final DoctorRepository doctorRepository;
        private final PriceListRepository priceListRepository;
        private final UserRepository userRepository;
        private final LabsClient labsClient;
        private final InvoiceService invoiceService;
        private final InvoiceRepository invoiceRepository;

        public List<AppointmentDto> getAppointmentsByHospital(UUID hospitalId, LocalDate date) {
                if (date != null) {
                        return appointmentRepository.findByHospitalIdAndApptDate(hospitalId, date).stream()
                                        .map(AppointmentDto::fromEntity)
                                        .collect(Collectors.toList());
                }
                return appointmentRepository.findByHospitalId(hospitalId).stream()
                                .map(AppointmentDto::fromEntity)
                                .collect(Collectors.toList());
        }

        public Page<AppointmentDto> getPaginatedAppointments(
                        UUID hospitalId,
                        UUID doctorId,
                        String dateFilter,
                        String search,
                        Pageable pageable) {
                LocalDate today = LocalDate.now();
                Page<Appointment> page = appointmentRepository.searchAppointments(
                                hospitalId,
                                doctorId,
                                dateFilter != null ? dateFilter.toUpperCase() : "ALL",
                                today,
                                search != null ? search : "",
                                pageable);
                return page.map(AppointmentDto::fromEntity);
        }

        public List<AppointmentDto> getAppointmentsByDoctor(UUID doctorId, LocalDate date) {
                return appointmentRepository.findByDoctorIdAndApptDate(doctorId, date).stream()
                                .map(AppointmentDto::fromEntity)
                                .collect(Collectors.toList());
        }

        /**
         * Cross-app: a doctor's live appointments/followups inside a leave window.
         * The People/HR service calls this while an admin records leave, keyed on
         * the shared {@code users.id} (People has no notion of HMS's doctors.id).
         * Returns an empty list when the user isn't a doctor here — a non-clinical
         * employee simply has nothing to conflict with. hospitalId is a tenant
         * guard: the resolved doctor must belong to the caller's hospital.
         */
        public List<AppointmentConflictDto> getLeaveConflictsForDoctorUser(
                        UUID userId, UUID hospitalId, LocalDate from, LocalDate to) {
                if (from == null || to == null || to.isBefore(from)) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                                        "Invalid date range: 'from' must be on or before 'to'.");
                }
                Optional<Doctor> doctorOpt = doctorRepository.findByUserId(userId);
                if (doctorOpt.isEmpty()) {
                        return List.of();
                }
                Doctor doctor = doctorOpt.get();
                if (doctor.getHospital() == null || !hospitalId.equals(doctor.getHospital().getId())) {
                        throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                                        "Doctor does not belong to the requested hospital.");
                }
                return appointmentRepository
                                .findActiveByDoctorIdAndApptDateBetween(doctor.getId(), from, to).stream()
                                .map(AppointmentConflictDto::fromEntity)
                                .collect(Collectors.toList());
        }

        public List<AppointmentDto> getAppointmentsByPatient(Integer patientId) {
                return appointmentRepository.findByPatientIdOrderByApptDateDescApptTimeDesc(patientId).stream()
                                .map(AppointmentDto::fromEntity)
                                .collect(Collectors.toList());
        }

        /**
         * Single-appointment hydration for the print-consultation view.
         * Uses findByIdWithRelations so patient + doctor.user + createdBy
         * + hospital are all materialised in one query — the DTO mapper
         * walks several of those proxies and we don't want a no-session
         * lazy init at response time.
         */
        public AppointmentDto getAppointmentById(UUID id) {
                Appointment appointment = appointmentRepository.findByIdWithRelations(id)
                                .orElseThrow(() -> new RuntimeException("Appointment not found"));
                return AppointmentDto.fromEntity(appointment);
        }

        public List<AppointmentDto> getPastDoctorsForPatient(Integer patientId, UUID hospitalId) {
                return appointmentRepository.findDistinctDoctorsByPatient(patientId, hospitalId).stream()
                                .map(d -> AppointmentDto.builder()
                                                .doctorId(d.getId())
                                                .doctorName(d.getUser().getFirstName() + " " + d.getUser().getLastName())
                                                .doctorSpecialization(d.getSpecialization())
                                                .build())
                                .collect(Collectors.toList());
        }

        @Transactional
        public AppointmentDto createAppointment(AppointmentRequest request, UUID createdById) {
                Hospital hospital = hospitalRepository.findById(request.getHospitalId())
                                .orElseThrow(() -> new RuntimeException("Hospital not found"));

                // Resolve patient — create a minimal walk-in record for emergencies
                Patient patient;
                if (request.getPatientId() != null) {
                        patient = patientRepository.findById(request.getPatientId())
                                        .orElseThrow(() -> new RuntimeException("Patient not found"));
                        // Tenant guard — patient must belong to the same hospital the
                        // appointment is being booked at; otherwise this is a cross-tenant
                        // read masquerading as a normal booking.
                        if (patient.getHospital() == null
                                        || !request.getHospitalId().equals(patient.getHospital().getId())) {
                                throw new RuntimeException("Patient does not belong to this hospital");
                        }
                } else if (request.getEmergencyPatientName() != null && !request.getEmergencyPatientName().isBlank()) {
                        String[] parts = request.getEmergencyPatientName().trim().split("\\s+", 2);
                        String uhid = generateUhid(hospital.getId());
                        patient = patientRepository.save(Patient.builder()
                                        .hospital(hospital)
                                        .uhid(uhid)
                                        .firstName(parts[0])
                                        .lastName(parts.length > 1 ? parts[1] : "—")
                                        .dob(LocalDate.now())
                                        .gender("U")
                                        .phone(request.getEmergencyPhone())
                                        .build());
                } else {
                        throw new RuntimeException("Patient is required");
                }

                // Doctor is optional for emergencies
                Doctor doctor = null;
                if (request.getDoctorId() != null) {
                        doctor = doctorRepository.findById(request.getDoctorId())
                                        .orElseThrow(() -> new RuntimeException("Doctor not found"));
                        if (doctor.getHospital() == null
                                        || !request.getHospitalId().equals(doctor.getHospital().getId())) {
                                throw new RuntimeException("Doctor does not belong to this hospital");
                        }
                }

                User createdBy = userRepository.findById(createdById)
                                .orElseThrow(() -> new RuntimeException("User not found"));

                PriceList priceList = null;
                if (request.getPriceListId() != null) {
                        priceList = priceListRepository.findById(request.getPriceListId())
                                        .orElseThrow(() -> new RuntimeException("Price List not found"));
                }

                LocalTime apptTime = request.getApptTime() != null ? request.getApptTime() : LocalTime.now().withSecond(0).withNano(0);
                LocalTime apptEndTime = doctor != null
                                ? apptTime.plusMinutes(doctor.getSlotDurationMin() != null ? doctor.getSlotDurationMin() : 15)
                                : apptTime.plusMinutes(15);

                // Check for slot collisions (only when doctor is assigned)
                if (doctor != null) {
                        long overlappingCount = appointmentRepository.countOverlappingAppointments(
                                        doctor.getId(), request.getApptDate(), apptTime, apptEndTime);
                        if (overlappingCount > 0) {
                                throw new RuntimeException("Slot collision detected for Doctor on the specified date and time.");
                        }
                }

                // Token number is NOT assigned at creation — the appointment starts in
                // SCHEDULED with a null token. A token is allocated only when the front
                // desk advances the status to CONFIRMED (or beyond) and the appointment
                // is for today; see {@link #updateAppointmentStatus}. This keeps the
                // hospital's today-queue dense and sequential (1..100) instead of
                // gapped by no-shows or future bookings.

                // Auto-create checkup booking via labs if a package is
                // selected. Labs owns health_checkup_bookings end-to-end now;
                // HMS only stores the FK UUID on the appointment row. The
                // @ManyToOne join (and the re-fetch that propped it up
                // during the migration) is gone — the booking's number,
                // status, results all live in labs and are surfaced via the
                // labs UI / the HMS-proxied checkup detail page.
                UUID checkupBookingId = null;
                if (request.getPackageId() != null) {
                        LabsCheckupBookingRequest br = new LabsCheckupBookingRequest();
                        br.setPatientId(request.getPatientId());
                        br.setPackageId(request.getPackageId());
                        br.setDoctorId(doctor.getId());
                        br.setScheduledDate(request.getApptDate().toString());
                        br.setScheduledTime(apptTime.toString());
                        br.setPaymentStatus("PENDING");

                        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
                        String jwt = (auth != null && auth.getCredentials() instanceof String s) ? s : null;
                        LabsCheckupBookingResponse created = labsClient.createHealthCheckupBooking(br, jwt);
                        if (created == null || created.getId() == null) {
                                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                                                "Labs returned no booking id for the checkup");
                        }
                        checkupBookingId = created.getId();
                }

                Appointment appointment = Appointment.builder()
                                .hospital(hospital)
                                .branchId(request.getBranchId())
                                .patient(patient)
                                .doctor(doctor)
                                .apptDate(request.getApptDate())
                                .apptTime(apptTime)
                                .apptEndTime(apptEndTime)
                                .type(request.getType() != null ? request.getType() : Appointment.AppointmentType.OPD)
                                .status(Appointment.AppointmentStatus.SCHEDULED)
                                .chiefComplaint(request.getChiefComplaint())
                                .priceList(priceList)
                                .checkupBookingId(checkupBookingId)
                                .createdBy(createdBy)
                                .build();

                return AppointmentDto.fromEntity(appointmentRepository.save(appointment));
        }

        private String generateUhid(UUID hospitalId) {
                String uhid;
                do {
                        long value = 10_000_000_000_000L +
                                        ThreadLocalRandom.current().nextLong(90_000_000_000_000L);
                        uhid = String.valueOf(value);
                } while (patientRepository.findByHospitalIdAndUhid(hospitalId, uhid).isPresent());
                return uhid;
        }

        // Permitted status transitions — mirrors the frontend STATUS_TRANSITIONS
        // map in AppointmentsDashboard.jsx so a direct API call cannot put a row
        // into an absurd state (e.g. COMPLETED → SCHEDULED, or BILLED back to anything).
        // BILLED is set by InvoiceService and treated as terminal; CANCELLED/NO_SHOW
        // can reset to SCHEDULED for reschedule.
        private static final java.util.Map<Appointment.AppointmentStatus, java.util.Set<Appointment.AppointmentStatus>>
                ALLOWED_TRANSITIONS = java.util.Map.of(
                        Appointment.AppointmentStatus.SCHEDULED, java.util.EnumSet.of(
                                Appointment.AppointmentStatus.CONFIRMED,
                                Appointment.AppointmentStatus.CHECKED_IN,
                                Appointment.AppointmentStatus.COMPLETED,
                                Appointment.AppointmentStatus.CANCELLED,
                                Appointment.AppointmentStatus.NO_SHOW),
                        Appointment.AppointmentStatus.CONFIRMED, java.util.EnumSet.of(
                                Appointment.AppointmentStatus.CHECKED_IN,
                                Appointment.AppointmentStatus.COMPLETED,
                                Appointment.AppointmentStatus.CANCELLED,
                                Appointment.AppointmentStatus.NO_SHOW),
                        Appointment.AppointmentStatus.CHECKED_IN, java.util.EnumSet.of(
                                Appointment.AppointmentStatus.CONFIRMED,
                                Appointment.AppointmentStatus.SCHEDULED,
                                Appointment.AppointmentStatus.IN_PROGRESS,
                                Appointment.AppointmentStatus.COMPLETED,
                                Appointment.AppointmentStatus.CANCELLED),
                        Appointment.AppointmentStatus.IN_PROGRESS, java.util.EnumSet.of(
                                Appointment.AppointmentStatus.COMPLETED,
                                Appointment.AppointmentStatus.CANCELLED),
                        Appointment.AppointmentStatus.COMPLETED, java.util.EnumSet.of(
                                Appointment.AppointmentStatus.BILLED),
                        Appointment.AppointmentStatus.CANCELLED, java.util.EnumSet.of(
                                Appointment.AppointmentStatus.SCHEDULED),
                        Appointment.AppointmentStatus.NO_SHOW, java.util.EnumSet.of(
                                Appointment.AppointmentStatus.SCHEDULED),
                        Appointment.AppointmentStatus.BILLED, java.util.EnumSet.noneOf(
                                Appointment.AppointmentStatus.class));

        // Statuses that occupy a slot in the day's token queue. Anything outside
        // this set (SCHEDULED / CANCELLED / NO_SHOW) holds no token.
        private static final java.util.Set<Appointment.AppointmentStatus> TOKEN_ELIGIBLE_STATUSES =
                        java.util.EnumSet.of(
                                        Appointment.AppointmentStatus.CONFIRMED,
                                        Appointment.AppointmentStatus.CHECKED_IN,
                                        Appointment.AppointmentStatus.IN_PROGRESS,
                                        Appointment.AppointmentStatus.COMPLETED,
                                        Appointment.AppointmentStatus.BILLED);

        private static final int TOKEN_CAP_PER_DAY = 100;

        @Transactional
        public AppointmentDto updateAppointmentStatus(UUID id, Appointment.AppointmentStatus status,
                        String cancelledReason, String refundMode, UUID refundBankAccountId, User actor) {
                // findByIdWithRelations hydrates patient + doctor.user + createdBy + hospital
                // up-front so the DTO mapper below (and any downstream listeners) never
                // hit a LazyInit/Role proxy if Hibernate auto-flushes between the read
                // and the save.
                Appointment appointment = appointmentRepository.findByIdWithRelations(id)
                                .orElseThrow(() -> new RuntimeException("Appointment not found"));

                Appointment.AppointmentStatus current = appointment.getStatus();
                if (current != status) {
                        java.util.Set<Appointment.AppointmentStatus> allowed = ALLOWED_TRANSITIONS.get(current);
                        if (allowed == null || !allowed.contains(status)) {
                                throw new RuntimeException("Invalid status transition: "
                                                + current + " → " + status);
                        }
                }

                if (status == Appointment.AppointmentStatus.CANCELLED) {
                        if (current != Appointment.AppointmentStatus.SCHEDULED && current != Appointment.AppointmentStatus.CONFIRMED) {
                                throw new RuntimeException("Appointments can only be cancelled if their status is SCHEDULED or CONFIRMED.");
                        }
                        if (cancelledReason == null || cancelledReason.trim().isEmpty()) {
                                throw new IllegalArgumentException("Cancellation reason is mandatory.");
                        }
                        appointment.setCancelledReason(cancelledReason);
                        appointment.setCancelledBy(actor);
                        appointment.setCancelledAt(java.time.LocalDateTime.now());

                        // Handle refund and set invoice status to CANCELLED
                        Optional<Invoice> opt = invoiceRepository.findByAppointment_Id(id);
                        if (opt.isPresent()) {
                                Invoice invoice = opt.get();
                                BigDecimal paid = invoice.getPaidAmount() != null ? invoice.getPaidAmount() : BigDecimal.ZERO;
                                if (paid.compareTo(BigDecimal.ZERO) > 0) {
                                        invoiceService.refundInvoicePayment(invoice, paid, refundMode, refundBankAccountId, actor);
                                        invoice.setStatus(InvoiceStatus.CANCELLED);
                                        invoiceRepository.save(invoice);
                                } else {
                                        // If unpaid, run normal logic (remove consultation item or delete invoice if empty)
                                        invoiceService.cancelAppointmentInvoice(id);
                                }
                        }
                }

                appointment.setStatus(status);

                // Token lifecycle:
                //   - Becoming queue-eligible (CONFIRMED/CHECKED_IN/IN_PROGRESS/COMPLETED/BILLED)
                //     and no token yet → assign next free number in THAT appointment's
                //     apptDate queue (1..100). Each apptDate is its own 1..100 sequence,
                //     so a CONFIRMED appointment booked today for tomorrow gets a token
                //     in tomorrow's queue, not today's.
                //   - Leaving the queue (SCHEDULED via reschedule, CANCELLED, NO_SHOW) → release
                //     the number so it doesn't dangle on a no-longer-active row.
                //   The cap is enforced at allocation time; over-cap requests get a null token
                //   (caller can run "Refresh Tokens" to renumber if real demand exceeds 100).
                if (TOKEN_ELIGIBLE_STATUSES.contains(status)) {
                        if (appointment.getTokenNumber() == null) {
                                LocalDate apptDate = appointment.getApptDate();
                                Integer maxToken = appointmentRepository
                                                .findMaxTokenNumberByHospitalIdAndApptDate(
                                                                appointment.getHospital().getId(), apptDate);
                                int next = (maxToken == null ? 0 : maxToken) + 1;
                                if (next <= TOKEN_CAP_PER_DAY) {
                                        appointment.setTokenNumber(next);
                                }
                        }
                } else {
                        // SCHEDULED / CANCELLED / NO_SHOW → release token if held
                        appointment.setTokenNumber(null);
                }

                AppointmentDto result = AppointmentDto.fromEntity(appointmentRepository.save(appointment));

                // CONFIRMED → create invoice with consultation fee immediately
                if (status == Appointment.AppointmentStatus.CONFIRMED) {
                        try { invoiceService.createAppointmentInvoice(id, true); } catch (Exception ignored) {}
                }

                return result;
        }

        @Transactional
        public AppointmentDto updateAppointment(UUID id, AppointmentRequest request, User actor) {
                Appointment appointment = appointmentRepository.findByIdWithRelations(id)
                                .orElseThrow(() -> new RuntimeException("Appointment not found"));

                Appointment.AppointmentStatus status = appointment.getStatus();
                if (status != Appointment.AppointmentStatus.SCHEDULED && status != Appointment.AppointmentStatus.CONFIRMED
                                && status != Appointment.AppointmentStatus.CANCELLED && status != Appointment.AppointmentStatus.NO_SHOW) {
                        throw new RuntimeException("Appointments can only be edited if their status is SCHEDULED, CONFIRMED, CANCELLED, or NO_SHOW.");
                }

                if (status == Appointment.AppointmentStatus.CANCELLED || status == Appointment.AppointmentStatus.NO_SHOW) {
                        if (status == Appointment.AppointmentStatus.NO_SHOW) {
                                Optional<Invoice> optInv = invoiceRepository.findByAppointment_Id(id);
                                if (optInv.isPresent()) {
                                        Invoice invoice = optInv.get();
                                        BigDecimal paid = invoice.getPaidAmount() != null ? invoice.getPaidAmount() : BigDecimal.ZERO;
                                        if (paid.compareTo(BigDecimal.ZERO) > 0) {
                                                String action = request.getNoShowPaymentAction();
                                                if (action == null || action.trim().isEmpty()) {
                                                        throw new IllegalArgumentException("Existing payments on no-show appointment must either be refunded or forfeited.");
                                                }
                                                if (action.equalsIgnoreCase("REFUND")) {
                                                        invoiceService.refundInvoicePayment(invoice, paid, request.getRefundMode(), request.getRefundBankAccountId(), actor);
                                                        invoice.setStatus(InvoiceStatus.CANCELLED);
                                                        invoiceRepository.save(invoice);
                                                } else if (action.equalsIgnoreCase("FORFEIT")) {
                                                        invoice.setAppointment(null); // Decouple from appointment
                                                        String oldNotes = invoice.getNotes() != null ? invoice.getNotes() : "";
                                                        invoice.setNotes((oldNotes + "\nNo-show fee forfeited (rescheduled)").trim());
                                                        invoiceRepository.save(invoice);
                                                } else {
                                                        throw new IllegalArgumentException("Invalid noShowPaymentAction: " + action);
                                                }
                                        }
                                }
                        }
                        appointment.setStatus(Appointment.AppointmentStatus.SCHEDULED);
                        appointment.setTokenNumber(null);
                }

                // Eagerly check slot collisions if doctor, date or time changed
                UUID oldDocId = appointment.getDoctor() != null ? appointment.getDoctor().getId() : null;
                UUID newDocId = request.getDoctorId();
                LocalDate oldDate = appointment.getApptDate();
                LocalDate newDate = request.getApptDate();
                LocalTime oldTime = appointment.getApptTime();
                LocalTime newTime = request.getApptTime() != null ? request.getApptTime() : oldTime;

                Doctor newDoc = null;
                if (newDocId != null) {
                        newDoc = doctorRepository.findById(newDocId)
                                        .orElseThrow(() -> new RuntimeException("Doctor not found"));
                        if (newDoc.getHospital() == null
                                        || !appointment.getHospital().getId().equals(newDoc.getHospital().getId())) {
                                throw new RuntimeException("Doctor does not belong to this hospital");
                        }
                }

                LocalTime apptEndTime = newDoc != null
                                ? newTime.plusMinutes(newDoc.getSlotDurationMin() != null ? newDoc.getSlotDurationMin() : 15)
                                : newTime.plusMinutes(15);

                if (newDoc != null && (!newDocId.equals(oldDocId) || !newDate.equals(oldDate) || !newTime.equals(oldTime))) {
                        long overlappingCount = appointmentRepository.countOverlappingAppointmentsExcludeSelf(
                                        newDocId, newDate, newTime, apptEndTime, appointment.getId());
                        if (overlappingCount > 0) {
                                throw new RuntimeException("Slot collision detected for Doctor on the specified date and time.");
                        }
                }

                // If doctor is changed, adjust consultation fee
                if (newDoc != null && !newDocId.equals(oldDocId)) {
                        boolean isFollowUp = appointment.getType() == Appointment.AppointmentType.FOLLOWUP;
                        
                        // Old fee
                        BigDecimal fOld = BigDecimal.ZERO;
                        Doctor oldDoc = appointment.getDoctor();
                        if (oldDoc != null) {
                                fOld = (isFollowUp && oldDoc.getFollowUpFee() != null && oldDoc.getFollowUpFee().compareTo(BigDecimal.ZERO) > 0)
                                                ? oldDoc.getFollowUpFee()
                                                : (oldDoc.getConsultationFee() != null ? oldDoc.getConsultationFee() : BigDecimal.ZERO);
                        }

                        // New fee
                        BigDecimal fNew = (isFollowUp && newDoc.getFollowUpFee() != null && newDoc.getFollowUpFee().compareTo(BigDecimal.ZERO) > 0)
                                        ? newDoc.getFollowUpFee()
                                        : (newDoc.getConsultationFee() != null ? newDoc.getConsultationFee() : BigDecimal.ZERO);

                        BigDecimal diff = fNew.subtract(fOld);

                        if (diff.compareTo(BigDecimal.ZERO) != 0) {
                                Optional<Invoice> opt = invoiceRepository.findByAppointment_Id(id)
                                                .filter(inv -> inv.getStatus() != InvoiceStatus.CANCELLED);
                                if (opt.isPresent()) {
                                        Invoice invoice = opt.get();
                                        
                                        // Create and save the new ADJUSTMENT InvoiceItem
                                        String description = "Adjustment - Doctor changed from Dr. " 
                                                        + (oldDoc != null && oldDoc.getUser() != null ? oldDoc.getUser().getLastName() : "Old")
                                                        + " to Dr. " 
                                                        + (newDoc.getUser() != null ? newDoc.getUser().getLastName() : "New");
                                        
                                        InvoiceItem adjItem = InvoiceItem.builder()
                                                        .invoice(invoice)
                                                        .itemType("ADJUSTMENT")
                                                        .description(description)
                                                        .quantity(1)
                                                        .unitPrice(diff)
                                                        .totalPrice(diff)
                                                        .appointmentId(appointment.getId())
                                                        .build();
                                        
                                        if (invoice.getItems() == null) {
                                                invoice.setItems(new java.util.ArrayList<>());
                                        }
                                        invoice.getItems().add(adjItem);

                                        // Update invoice totals
                                        invoice.setSubtotal(invoice.getSubtotal().add(diff));
                                        invoice.setTotal(invoice.getTotal().add(diff));
                                        invoice.setUpdatedAt(LocalDateTime.now());
                                        invoice.setUpdatedBy(actor);
                                        invoiceRepository.save(invoice);

                                        // Apply overpayment rule for refunds: refundAmount = paidAmount - newTotal
                                        BigDecimal paid = invoice.getPaidAmount() != null ? invoice.getPaidAmount() : BigDecimal.ZERO;
                                        BigDecimal total = invoice.getTotal() != null ? invoice.getTotal() : BigDecimal.ZERO;
                                        BigDecimal refundAmount = paid.subtract(total);

                                        if (refundAmount.compareTo(BigDecimal.ZERO) > 0) {
                                                invoiceService.refundInvoicePayment(invoice, refundAmount, request.getRefundMode(), request.getRefundBankAccountId(), actor);
                                        }

                                        // Recompute invoice status
                                        BigDecimal newPaid = invoice.getPaidAmount() != null ? invoice.getPaidAmount() : BigDecimal.ZERO;
                                        BigDecimal newTotal = invoice.getTotal() != null ? invoice.getTotal() : BigDecimal.ZERO;
                                        if (newPaid.compareTo(BigDecimal.ZERO) == 0) {
                                                invoice.setStatus(InvoiceStatus.UNPAID);
                                        } else if (newPaid.compareTo(newTotal) >= 0) {
                                                invoice.setStatus(InvoiceStatus.PAID);
                                        } else {
                                                invoice.setStatus(InvoiceStatus.PARTIAL);
                                        }
                                        invoiceRepository.save(invoice);
                                }
                        }
                }

                // Update appointment fields
                appointment.setDoctor(newDoc);
                appointment.setApptDate(newDate);
                appointment.setApptTime(newTime);
                appointment.setApptEndTime(apptEndTime);
                if (request.getType() != null) {
                        appointment.setType(request.getType());
                }
                if (request.getChiefComplaint() != null) {
                        appointment.setChiefComplaint(request.getChiefComplaint());
                }
                if (request.getPriceListId() != null) {
                        PriceList priceList = priceListRepository.findById(request.getPriceListId())
                                        .orElseThrow(() -> new RuntimeException("Price List not found"));
                        appointment.setPriceList(priceList);
                }

                appointment.setUpdatedAt(LocalDateTime.now());

                return AppointmentDto.fromEntity(appointmentRepository.save(appointment));
        }

        /**
         * Reset and re-number the entire today-queue for a hospital. Walks all of
         * today's appointments in createdAt order, assigning 1..N to the token-
         * eligible ones (CONFIRMED+) and clearing any token off the ineligible
         * ones (SCHEDULED / CANCELLED / NO_SHOW). Useful after a busy morning
         * where the natural confirmation order doesn't match arrival order any
         * more — one click puts the queue back in chronological sequence.
         */
        @Transactional
        public int refreshTokensForToday(UUID hospitalId) {
                LocalDate today = LocalDate.now();
                List<Appointment> todays = appointmentRepository
                                .findByHospitalIdAndApptDateOrderByCreatedAtAsc(hospitalId, today);

                int counter = 1;
                int assigned = 0;
                for (Appointment a : todays) {
                        if (TOKEN_ELIGIBLE_STATUSES.contains(a.getStatus()) && counter <= TOKEN_CAP_PER_DAY) {
                                a.setTokenNumber(counter++);
                                assigned++;
                        } else {
                                a.setTokenNumber(null);
                        }
                }
                appointmentRepository.saveAll(todays);
                return assigned;
        }
}
