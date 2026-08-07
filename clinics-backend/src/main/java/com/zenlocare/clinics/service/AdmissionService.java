package com.zenlocare.clinics.service;

import com.zenlocare.clinics.dto.AdmissionDTO;
import com.zenlocare.clinics.dto.AdmissionRequest;
import com.zenlocare.clinics.dto.DischargeRequest;
import com.zenlocare.clinics.entity.*;
import com.zenlocare.clinics.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.Map;
import java.util.HashMap;
import java.util.stream.Collectors;

@Slf4j
@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class AdmissionService {

    private final AdmissionRepository admissionRepository;
    private final DischargeRepository dischargeRepository;
    private final HospitalRepository hospitalRepository;
    private final PatientRepository patientRepository;
    private final RoomRepository roomRepository;
    private final BedRepository bedRepository;
    private final DoctorRepository doctorRepository;
    private final DepartmentRepository departmentRepository;
    private final AppointmentRepository appointmentRepository;
    private final RoomLogRepository roomLogRepository;
    private final UserRepository userRepository;
    private final InvoiceService invoiceService;
    private final InvoiceRepository invoiceRepository;
    private final PatientAdvanceService patientAdvanceService;
    private final RoomTypeConfigRepository roomTypeConfigRepository;

    // Tenant boundary guard — every entity touched by an admission flow must
    // belong to the same hospital as the admission/request. Without this,
    // a forged or stale ID can pull a record from another hospital into the
    // current tenant's transaction.
    private static void assertSameHospital(UUID expected, UUID actual, String label) {
        if (expected == null || actual == null || !expected.equals(actual)) {
            throw new RuntimeException(label + " does not belong to this hospital");
        }
    }

    /**
     * Returns true if a given bed is available for a new admission.
     *
     * A bed is occupied under either condition:
     *   (a) An ADMITTED admission already targets this bed_id directly, or
     *   (b) An ADMITTED admission holds the room via room_id with bed_id=NULL
     *       — i.e. someone is admitted "to the room" without picking a bed
     *       (the legacy room-level allocation flow), which effectively locks
     *       the whole room from concurrent bed-level allocations.
     *
     * Without (b) a multi-bed room with a bed-less admission would falsely
     * read as "all beds free" and we'd over-admit. The {@code admit} path
     * historically only checked (b) via {@code existsByRoomIdAndStatus},
     * which falsely rejected EVERY multi-bed room the moment one bed
     * filled up. This helper unifies both checks the right way.
     */
    private boolean isBedAvailable(Bed bed) {
        if (bed == null) return false;
        if (bed.isUnderMaintenance()) return false;
        if (admissionRepository.existsByBedIdAndStatus(bed.getId(), AdmissionStatus.ADMITTED)) return false;
        // Room-level exclusive lock — only meaningful when the bed belongs to a room.
        if (bed.getRoom() != null
                && admissionRepository.existsByRoomIdAndBedIdIsNullAndStatus(
                        bed.getRoom().getId(), AdmissionStatus.ADMITTED)) {
            return false;
        }
        return true;
    }

    /**
     * Multi-bed-aware room availability — true when at least one bed in the
     * room is free per {@link #isBedAvailable}. Centralising it keeps the
     * admit and reassign paths in lock-step.
     */
    private boolean isAnyBedFreeInRoom(Long roomId) {
        // Room-level lock short-circuits everything below: if someone already
        // holds the room without specifying a bed, no individual bed in it is
        // assignable until they're discharged or moved.
        if (admissionRepository.existsByRoomIdAndBedIdIsNullAndStatus(roomId, AdmissionStatus.ADMITTED)) {
            return false;
        }
        return bedRepository.findByRoomIdOrderByBedNumberAsc(roomId).stream()
                .anyMatch(b -> !b.isUnderMaintenance()
                        && !admissionRepository.existsByBedIdAndStatus(b.getId(), AdmissionStatus.ADMITTED));
    }

    @Transactional
    public AdmissionDTO admit(AdmissionRequest req, String performedBy) {
        Hospital hospital = hospitalRepository.findById(req.getHospitalId())
                .orElseThrow(() -> new RuntimeException("Hospital not found"));
        Patient patient = patientRepository.findById(req.getPatientId())
                .orElseThrow(() -> new RuntimeException("Patient not found"));
        assertSameHospital(req.getHospitalId(), patient.getHospital().getId(), "Patient");

        admissionRepository.findByPatientIdAndStatus(req.getPatientId(), AdmissionStatus.ADMITTED)
                .ifPresent(a -> { throw new RuntimeException("Patient is already admitted (ADM: " + a.getAdmissionNumber() + ")"); });

        Doctor doctor = req.getAdmittingDoctorId() != null
                ? doctorRepository.findById(req.getAdmittingDoctorId()).orElse(null) : null;
        if (doctor != null && doctor.getHospital() != null) {
            assertSameHospital(req.getHospitalId(), doctor.getHospital().getId(), "Doctor");
        }
        Department dept = req.getDepartmentId() != null
                ? departmentRepository.findById(req.getDepartmentId()).orElse(null) : null;
        if (dept != null && dept.getHospital() != null) {
            assertSameHospital(req.getHospitalId(), dept.getHospital().getId(), "Department");
        }
        Appointment sourceAppt = req.getSourceAppointmentId() != null
                ? appointmentRepository.findById(req.getSourceAppointmentId()).orElse(null) : null;
        if (sourceAppt != null) {
            assertSameHospital(req.getHospitalId(), sourceAppt.getHospital().getId(), "Source appointment");
        }

        Room room = null;
        if (req.getRoomId() != null) {
            room = roomRepository.findById(req.getRoomId())
                    .orElseThrow(() -> new RuntimeException("Room not found"));
            assertSameHospital(req.getHospitalId(), room.getHospital().getId(), "Room");
            if (room.isUnderMaintenance()) {
                throw new RuntimeException("Room is under maintenance");
            }
            // When the caller is picking a specific bed the bed-level availability
            // check below is the authoritative gate — checking room-level "is
            // anyone admitted" here used to falsely reject every multi-bed room
            // the moment one bed was occupied. We only fall back to the
            // "anyBedFree" check when no bed has been specified.
            if (req.getBedId() == null && !isAnyBedFreeInRoom(room.getId())) {
                throw new RuntimeException("Room is not available — all beds are occupied");
            }
        }

        Bed bed = null;
        if (req.getBedId() != null) {
            bed = bedRepository.findById(req.getBedId())
                    .orElseThrow(() -> new RuntimeException("Bed not found"));
            Hospital bedHospital = bed.getRoom() != null ? bed.getRoom().getHospital() : bed.getWard().getFloor().getBuilding().getHospital();
            assertSameHospital(req.getHospitalId(), bedHospital.getId(), "Bed");
            if (!isBedAvailable(bed)) {
                throw new RuntimeException("Selected bed is not available");
            }
        } else if (room != null) {
            boolean isMultiBed = bedRepository.countByRoomId(room.getId()) > 1;
            if (!isMultiBed) {
                bed = bedRepository.findByRoomIdOrderByBedNumberAsc(room.getId()).stream()
                        .filter(this::isBedAvailable)
                        .findFirst()
                        .orElse(null);
            }
        }

        String admNumber = generateAdmissionNumber(hospital);
        String ipdId = generateIpdId(hospital);

        Admission admission = Admission.builder()
                .hospital(hospital)
                .patient(patient)
                .room(room)
                .bed(bed)
                .admittingDoctor(doctor)
                .department(dept)
                .sourceAppointment(sourceAppt)
                .admissionNumber(admNumber)
                .ipdId(ipdId)
                .admissionType(req.getAdmissionType() != null ? req.getAdmissionType() : AdmissionType.OPD_REFERRAL)
                .admissionSource(req.getAdmissionSource() != null ? req.getAdmissionSource() : AdmissionSource.DIRECT)
                .chiefComplaint(req.getChiefComplaint())
                .approxDischargeDate(req.getApproxDischargeDate())
                .attenderName(req.getAttenderName())
                .attenderPhone(req.getAttenderPhone())
                .attenderRelationship(req.getAttenderRelationship())
                .status(AdmissionStatus.ADMITTED)
                .build();

        Admission saved = admissionRepository.save(admission);

        if (room != null) {


            roomLogRepository.save(RoomLog.builder()
                    .room(room).hospital(hospital)
                    .event(RoomLogEvent.ALLOCATED)
                    .roomNumber(room.getRoomNumber())
                    .patientName(patient.getFirstName() + " " + patient.getLastName())
                    .patientUhid(patient.getUhid())
                    .attenderName(req.getAttenderName())
                    .allocationToken(admNumber)
                    .performedBy(performedBy)
                    .build());
        }

        // Auto-link any floating registration advances (collected at registration desk before
        // this admission was created) to this admission so they appear in the final bill.
        try { patientAdvanceService.linkRegistrationAdvancesToAdmission(req.getPatientId(), saved.getId()); }
        catch (Exception e) {
            log.warn("Failed to link registration advances to admission {}: {}", saved.getId(), e.getMessage());
        }

        // Auto-create UNPAID placeholder invoice for IPD billing tracking.
        // Pass sourceAppt ID directly — avoids lazy-loading inside the invoice service.
        UUID sourceApptId = sourceAppt != null ? sourceAppt.getId() : null;
        try { invoiceService.createAdmissionInvoice(req.getHospitalId(), req.getPatientId(), saved.getId(), saved.getAdmissionNumber(), sourceApptId); }
        catch (Exception e) {
            log.error("Failed to create/merge IPD invoice for admission {} (sourceAppt={}): {}",
                    saved.getId(), sourceApptId, e.getMessage(), e);
        }

        // Auto-merge any eligible same-hospital ambulance bookings into the IPD invoice.
        // Runs AFTER createAdmissionInvoice so the IPD invoice exists before we add line items.
        // Failures here must NOT block the admission — they're logged for follow-up.
        try { invoiceService.autoMergeSameHospitalAmbulancesIntoIpd(saved.getId()); }
        catch (Exception e) {
            log.error("Failed to merge same-hospital ambulance bookings for admission {}: {}",
                    saved.getId(), e.getMessage(), e);
        }

        return toDTO(saved);
    }

    @Transactional
    public AdmissionDTO assignRoom(UUID admissionId, Long roomId, String performedBy) {
        Admission admission = admissionRepository.findById(admissionId)
                .orElseThrow(() -> new RuntimeException("Admission not found"));
        if (admission.getStatus() != AdmissionStatus.ADMITTED) {
            throw new RuntimeException("Admission is not active");
        }
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));
        assertSameHospital(admission.getHospital().getId(), room.getHospital().getId(), "Room");
        if (room.isUnderMaintenance()) {
            throw new RuntimeException("Room is under maintenance");
        }
        // Multi-bed-aware availability: "room available" means at least one bed
        // in the room is free. The previous existsByRoomIdAndStatus check
        // returned true whenever any bed was occupied, falsely blocking
        // re-allocation into the same multi-bed room.
        if (!isAnyBedFreeInRoom(room.getId())) {
            throw new RuntimeException("Room is not available — all beds are occupied");
        }

        boolean isMultiBed = bedRepository.countByRoomId(room.getId()) > 1;

        Bed bed = null;
        if (!isMultiBed) {
            bed = bedRepository.findByRoomIdOrderByBedNumberAsc(room.getId()).stream()
                    .filter(b -> !b.isUnderMaintenance() && !admissionRepository.existsByBedIdAndStatus(b.getId(), AdmissionStatus.ADMITTED))
                    .findFirst()
                    .orElse(null);
        }

        admission.setRoom(room);
        if (bed != null) admission.setBed(bed);
        admission.setAdmissionDate(LocalDateTime.now());
        admissionRepository.save(admission);

        roomLogRepository.save(RoomLog.builder()
                .room(room).hospital(admission.getHospital())
                .event(RoomLogEvent.ALLOCATED)
                .roomNumber(room.getRoomNumber())
                .patientName(admission.getPatient().getFirstName() + " " + admission.getPatient().getLastName())
                .patientUhid(admission.getPatient().getUhid())
                .allocationToken(admission.getAdmissionNumber())
                .performedBy(performedBy)
                .build());

        return toDTO(admission);
    }

    @Transactional
    public AdmissionDTO discharge(UUID admissionId, DischargeRequest req, String performedBy) {
        Admission admission = admissionRepository.findById(admissionId)
                .orElseThrow(() -> new RuntimeException("Admission not found"));
        if (admission.getStatus() != AdmissionStatus.ADMITTED) {
            throw new RuntimeException("Admission is not active");
        }

        // Gate: invoice must be fully settled before discharge is permitted
        invoiceRepository.findAllByAdmission_IdOrderByCreatedAtDesc(admissionId)
                .stream().findFirst().ifPresent(inv -> {
            if (InvoiceStatus.UNPAID.equals(inv.getStatus())
                    || InvoiceStatus.PARTIAL.equals(inv.getStatus())
                    || InvoiceStatus.UNSETTLED.equals(inv.getStatus())) {
                throw new RuntimeException("INVOICE_UNPAID: Patient bill must be fully settled before discharge. Please settle the outstanding balance in the Billing tab.");
            }
        });

        LocalDateTime dischargeTime = req.getActualDischargeDate() != null
                ? req.getActualDischargeDate() : LocalDateTime.now();

        admission.setStatus(AdmissionStatus.DISCHARGED);
        // Keep denormalized date on admission for fast count queries
        admission.setActualDischargeDate(dischargeTime);

        // Write full discharge details to the discharges table
        Discharge discharge = dischargeRepository.findByAdmission_Id(admissionId)
                .orElseGet(() -> Discharge.builder().admission(admission).build());
        discharge.setActualDischargeDate(dischargeTime);
        discharge.setDischargeDiagnosis(req.getDischargeDiagnosis());
        discharge.setDischargeNote(req.getDischargeNote());
        discharge.setFollowUpDate(req.getFollowUpDate());
        discharge.setFollowUpDoctorId(req.getFollowUpDoctorId());
        discharge.setDischargedBy(performedBy);
        discharge.setDischargedAt(LocalDateTime.now());
        dischargeRepository.save(discharge);

        if (admission.getRoom() != null) {
            Room room = admission.getRoom();
            String patName = admission.getPatient().getFirstName() + " " + admission.getPatient().getLastName();

            roomLogRepository.save(RoomLog.builder()
                    .room(room).hospital(admission.getHospital())
                    .event(RoomLogEvent.DEALLOCATED)
                    .roomNumber(room.getRoomNumber())
                    .patientName(patName)
                    .patientUhid(admission.getPatient().getUhid())
                    .performedBy(performedBy)
                    .build());
        }

        return toDTO(admissionRepository.save(admission));
    }

    /**
     * True for any room whose RoomTypeConfig has category="OT" — OT, CATH_LAB,
     * and hospital-specific OT-category codes. Hardcoding the literal "OT"
     * string used to reject Cath Lab rooms even though they're seeded with
     * category="OT". POST_OT is explicitly excluded because it's recovery, not
     * surgery. Hospital-specific overrides win over the system default.
     */
    private boolean isOtCategoryRoom(UUID hospitalId, Room room) {
        String roomCode = room.getRoomType();
        RoomTypeConfig cfg = roomTypeConfigRepository
                .findByHospitalIdAndCode(hospitalId, roomCode)
                .or(() -> roomTypeConfigRepository.findSystemByCode(roomCode))
                .orElse(null);
        return cfg != null
                && "OT".equalsIgnoreCase(cfg.getCategory())
                && !"POST_OT".equalsIgnoreCase(cfg.getCode());
    }

    @Transactional
    public AdmissionDTO moveToOT(UUID admissionId, Long roomId, UUID doctorId, UUID otBookingId, String performedBy) {
        Admission admission = admissionRepository.findById(admissionId)
                .orElseThrow(() -> new RuntimeException("Admission not found"));
        if (admission.getStatus() != AdmissionStatus.ADMITTED)
            throw new RuntimeException("Admission is not active");

        // Idempotent retry: OTM's start flow is HMS-first — if this move already
        // succeeded but OTM's local transition then failed, OTM retries the whole
        // start, including this call. Without this guard the retry dead-ends on
        // "OT room is not available" (the room is occupied by this very
        // admission) and the case can never be started.
        if (otBookingId != null && otBookingId.equals(admission.getOtBookingId())) {
            return toDTO(admission);
        }

        Room otRoom = roomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("OT room not found"));
        assertSameHospital(admission.getHospital().getId(), otRoom.getHospital().getId(), "OT room");
        if (!isOtCategoryRoom(admission.getHospital().getId(), otRoom))
            throw new RuntimeException("Selected room is not an OT room");
        boolean isOtRoomAvailable = !otRoom.isUnderMaintenance() && !admissionRepository.existsByRoomIdAndStatus(otRoom.getId(), AdmissionStatus.ADMITTED);
        if (!isOtRoomAvailable)
            throw new RuntimeException("OT room is not available");
        if (doctorId != null) {
            Doctor d = doctorRepository.findById(doctorId).orElseThrow(() -> new RuntimeException("Doctor not found"));
            assertSameHospital(admission.getHospital().getId(), d.getHospital().getId(), "Doctor");
        }

        // Save current ward room so we can return patient after surgery (do NOT vacate it — bed is held)
        if (admission.getRoom() != null && admission.getPreviousRoom() == null) {
            admission.setPreviousRoom(admission.getRoom());
        }

        // patient-of-record to the OT room while keeping the bed allocated
        // (status stays OCCUPIED — the bed is held for return). Without this,
        // Rooms.jsx would show the same patient on both the ward and OT rows.
        // Handled purely by Admission associations now.

        Room savedRoom = otRoom;

        // Update admission to OT room, record OT booking ref
        admission.setRoom(savedRoom);
        admission.setOtBookingId(otBookingId);
        if (doctorId != null) {
            doctorRepository.findById(doctorId).ifPresent(admission::setAdmittingDoctor);
        }

        roomLogRepository.save(com.zenlocare.clinics.entity.RoomLog.builder()
                .room(savedRoom)
                .hospital(admission.getHospital())
                .event(com.zenlocare.clinics.entity.RoomLogEvent.ALLOCATED)
                .roomNumber(savedRoom.getRoomNumber())
                .patientName(admission.getPatient().getFirstName() + " " + admission.getPatient().getLastName())
                .patientUhid(admission.getPatient().getUhid())
                .performedBy(performedBy)
                .build());

        return toDTO(admissionRepository.save(admission));
    }

    @Transactional
    public AdmissionDTO returnFromOT(UUID admissionId, Long postOtRoomId, String performedBy) {
        Admission admission = admissionRepository.findById(admissionId)
                .orElseThrow(() -> new RuntimeException("Admission not found"));

        // Idempotent retry: OTM's end flow is HMS-first — if this return already
        // succeeded but OTM's local transition then failed, OTM retries the whole
        // end, including this call. moveToOT sets otBookingId and this method
        // clears it, so a null otBookingId means the patient has already been
        // returned. Without this guard the retry either dead-ends on "Post-OT
        // room is not available" (occupied by this very admission) or — worse —
        // falls through to the no-previous-room branch and nulls the patient's
        // room pointer, silently losing their bed.
        if (admission.getOtBookingId() == null) {
            return toDTO(admission);
        }

        // Free the OT room. Category-based check (mirrors moveToOT): any room
        // whose RoomTypeConfig category is "OT" — OT, CATH_LAB, etc. The old
        // hardcoded "OT" literal skipped the deallocation log for cath-lab rooms.
        if (admission.getRoom() != null && isOtCategoryRoom(admission.getHospital().getId(), admission.getRoom())) {
            Room otRoom = admission.getRoom();

            roomLogRepository.save(com.zenlocare.clinics.entity.RoomLog.builder()
                    .room(otRoom).hospital(admission.getHospital())
                    .event(com.zenlocare.clinics.entity.RoomLogEvent.DEALLOCATED)
                    .roomNumber(otRoom.getRoomNumber())
                    .patientName(admission.getPatient().getFirstName() + " " + admission.getPatient().getLastName())
                    .patientUhid(admission.getPatient().getUhid())
                    .performedBy(performedBy)
                    .build());
        }

        if (postOtRoomId != null) {
            // Move to post-OT recovery room (previousRoom stays saved for later return to ward)
            Room postOtRoom = roomRepository.findById(postOtRoomId)
                    .orElseThrow(() -> new RuntimeException("Post-OT room not found"));
            assertSameHospital(admission.getHospital().getId(), postOtRoom.getHospital().getId(), "Post-OT room");
            if (!"POST_OT".equals(postOtRoom.getRoomType()))
                throw new RuntimeException("Selected room is not a POST_OT room");
            boolean isPostOtAvailable = !postOtRoom.isUnderMaintenance() && !admissionRepository.existsByRoomIdAndStatus(postOtRoom.getId(), AdmissionStatus.ADMITTED);
            if (!isPostOtAvailable)
                throw new RuntimeException("Post-OT room is not available");

            admission.setRoom(postOtRoom);

            roomLogRepository.save(com.zenlocare.clinics.entity.RoomLog.builder()
                    .room(postOtRoom).hospital(admission.getHospital())
                    .event(com.zenlocare.clinics.entity.RoomLogEvent.ALLOCATED)
                    .roomNumber(postOtRoom.getRoomNumber())
                    .patientName(admission.getPatient().getFirstName() + " " + admission.getPatient().getLastName())
                    .patientUhid(admission.getPatient().getUhid())
                    .performedBy(performedBy)
                    .build());
        } else if (admission.getPreviousRoom() != null) {
            // Restore the patient pointer we cleared during moveToOT.
            Room wardRoom = admission.getPreviousRoom();
            roomRepository.save(wardRoom);
            admission.setRoom(wardRoom);
            admission.setPreviousRoom(null);
        } else {
            // Patient was admitted directly to OT (no prior ward room); clear room so
            // discharge/reassignment can proceed normally
            admission.setRoom(null);
        }

        admission.setOtBookingId(null);
        return toDTO(admissionRepository.save(admission));
    }

    @Transactional
    public AdmissionDTO returnToWard(UUID admissionId, String performedBy) {
        Admission admission = admissionRepository.findById(admissionId)
                .orElseThrow(() -> new RuntimeException("Admission not found"));
        if (admission.getPreviousRoom() == null)
            throw new RuntimeException("No original ward room recorded for this admission");

        // Free post-OT room if currently in one
        if (admission.getRoom() != null && "POST_OT".equals(admission.getRoom().getRoomType())) {
            Room postOtRoom = admission.getRoom();

            roomLogRepository.save(com.zenlocare.clinics.entity.RoomLog.builder()
                    .room(postOtRoom).hospital(admission.getHospital())
                    .event(com.zenlocare.clinics.entity.RoomLogEvent.DEALLOCATED)
                    .roomNumber(postOtRoom.getRoomNumber())
                    .patientName(admission.getPatient().getFirstName() + " " + admission.getPatient().getLastName())
                    .patientUhid(admission.getPatient().getUhid())
                    .performedBy(performedBy)
                    .build());
        }

        Room wardRoom = admission.getPreviousRoom();
        roomRepository.save(wardRoom);
        admission.setRoom(wardRoom);
        admission.setPreviousRoom(null);
        return toDTO(admissionRepository.save(admission));
    }

    public List<AdmissionDTO> getActive(UUID hospitalId) {
        return admissionRepository.findByHospitalIdAndStatusOrderByAdmissionDateDesc(hospitalId, AdmissionStatus.ADMITTED)
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getPaginated(UUID hospitalId, String statusStr, String search, Pageable pageable) {
        AdmissionStatus status = null;
        try {
            if (statusStr != null && !statusStr.equalsIgnoreCase("ALL")) {
                status = AdmissionStatus.valueOf(statusStr.toUpperCase());
            }
        } catch (IllegalArgumentException e) {
            statusStr = "ALL";
        }

        Page<Admission> page = admissionRepository.searchAdmissions(
                hospitalId,
                status,
                statusStr != null ? statusStr.toUpperCase() : "ALL",
                search != null ? search.trim() : "",
                pageable
        );

        Page<AdmissionDTO> pageDto = page.map(this::toDTO);

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime startOfDay = now.toLocalDate().atStartOfDay();

        long totalAdmitted = admissionRepository.countActiveByHospital(hospitalId);
        long totalInOt = admissionRepository.countActiveInOtByHospital(hospitalId);
        long dischargedToday = admissionRepository.countDischargedTodayByHospital(hospitalId, startOfDay);
        long overdueDischarge = admissionRepository.countOverdueByHospital(hospitalId, now);

        Map<String, Object> result = new HashMap<>();
        result.put("page", pageDto);
        result.put("totalAdmitted", totalAdmitted);
        result.put("totalInOt", totalInOt);
        result.put("dischargedToday", dischargedToday);
        result.put("overdueDischarge", overdueDischarge);

        return result;
    }

    @Transactional(readOnly = true)
    public List<AdmissionDTO> getAll(UUID hospitalId) {
        return admissionRepository.findByHospitalIdOrderByAdmissionDateDesc(hospitalId)
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<AdmissionDTO> getByPatient(Integer patientId) {
        return admissionRepository.findByPatientIdOrderByAdmissionDateDesc(patientId)
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public AdmissionDTO get(UUID id) {
        return toDTO(admissionRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Admission not found")));
    }

    private String generateAdmissionNumber(Hospital hospital) {
        String year = String.valueOf(LocalDateTime.now().getYear());
        long total = admissionRepository.findByHospitalIdOrderByAdmissionDateDesc(hospital.getId()).size();
        return HospitalIdPrefix.of(hospital) + "ADM-" + year + "-" + String.format("%04d", total + 1);
    }

    private String generateIpdId(Hospital hospital) {
        String year = String.valueOf(LocalDateTime.now().getYear());
        String hospPrefix = HospitalIdPrefix.of(hospital);
        String coreFormat = "IPD-" + year + "-";
        List<String> existing = admissionRepository.findIpdIdsForYear(hospital.getId(), year);
        int maxSeq = existing.stream()
                .mapToInt(this::extractTrailingSequence)
                .max().orElse(0);
        return hospPrefix + coreFormat + String.format("%04d", maxSeq + 1);
    }

    private int extractTrailingSequence(String id) {
        if (id == null) return 0;
        try {
            int dash = id.lastIndexOf('-');
            if (dash < 0 || dash == id.length() - 1) return 0;
            return Integer.parseInt(id.substring(dash + 1));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    public AdmissionDTO toDTO(Admission a) {
        // If room/bed weren't set on the admission (pre-fix allocations), look up via bed table
        Room room = a.getRoom();
        com.zenlocare.clinics.entity.Bed bed = a.getBed();
        final Room resolvedRoom = room;
        final com.zenlocare.clinics.entity.Bed resolvedBed = bed;

        // Load discharge record — use lazy-loaded association if already in session, else query
        Discharge discharge = a.getDischarge();
        if (discharge == null && a.getStatus() == AdmissionStatus.DISCHARGED) {
            discharge = dischargeRepository.findByAdmission_Id(a.getId()).orElse(null);
        }
        final Discharge d = discharge;

        return AdmissionDTO.builder()
                .id(a.getId())
                .admissionNumber(a.getAdmissionNumber())
                .ipdId(a.getIpdId())
                .patientId(a.getPatient().getId())
                .patientName(a.getPatient().getFirstName() + " " + a.getPatient().getLastName())
                .patientUhid(a.getPatient().getUhid())
                .roomId(resolvedRoom != null ? resolvedRoom.getId() : null)
                .roomNumber(resolvedRoom != null ? resolvedRoom.getRoomNumber() : null)
                .roomType(resolvedRoom != null ? resolvedRoom.getRoomType() : null)
                .roomPricePerDay(resolvedRoom != null ? resolvedRoom.getPricePerDay() : null)
                .bedId(resolvedBed != null ? resolvedBed.getId() : null)
                .bedNumber(resolvedBed != null ? resolvedBed.getBedNumber() : null)
                .admittingDoctorId(a.getAdmittingDoctor() != null ? a.getAdmittingDoctor().getId() : null)
                .admittingDoctorName(a.getAdmittingDoctor() != null
                        ? a.getAdmittingDoctor().getUser().getFirstName() + " " + a.getAdmittingDoctor().getUser().getLastName()
                        : null)
                .departmentId(a.getDepartment() != null ? a.getDepartment().getId() : null)
                .departmentName(a.getDepartment() != null ? a.getDepartment().getName() : null)
                .sourceAppointmentId(a.getSourceAppointment() != null ? a.getSourceAppointment().getId() : null)
                .admissionType(a.getAdmissionType())
                .admissionSource(a.getAdmissionSource())
                .chiefComplaint(a.getChiefComplaint())
                .primaryDiagnosis(a.getPrimaryDiagnosis())
                .attenderName(a.getAttenderName())
                .attenderPhone(a.getAttenderPhone())
                .attenderRelationship(a.getAttenderRelationship())
                .status(a.getStatus())
                .admissionDate(a.getAdmissionDate())
                .actualDischargeDate(a.getActualDischargeDate())
                .approxDischargeDate(a.getApproxDischargeDate())
                .createdAt(a.getCreatedAt())
                .previousRoomId(a.getPreviousRoom() != null ? a.getPreviousRoom().getId() : null)
                .otBookingId(a.getOtBookingId())
                .inOt(resolvedRoom != null && "OT".equals(resolvedRoom.getRoomType()))
                // Discharge details from discharges table
                .dischargeDiagnosis(d != null ? d.getDischargeDiagnosis() : null)
                .dischargeNote(d != null ? d.getDischargeNote() : null)
                .followUpDate(d != null ? d.getFollowUpDate() : null)
                .followUpDoctorId(d != null ? d.getFollowUpDoctorId() : null)
                .dischargedBy(d != null ? d.getDischargedBy() : null)
                .dischargedAt(d != null ? d.getDischargedAt() : null)
                .build();
    }

    /**
     * Set/replace the attender on an admission. Attender data lives only here
     * — Room.attender_* columns were removed in this refactor. The audit log
     * (RoomLog) still records ATTENDER_ASSIGNED / ATTENDER_UPDATED so the
     * Room Logs UI keeps showing attender changes for whichever room the
     * admission currently occupies.
     */
    @Transactional
    public AdmissionDTO updateAttender(UUID admissionId,
                                       com.zenlocare.clinics.dto.AttenderUpdateRequest req,
                                       String performedBy) {
        Admission admission = admissionRepository.findById(admissionId)
                .orElseThrow(() -> new RuntimeException("Admission not found"));

        boolean isNew = admission.getAttenderName() == null || admission.getAttenderName().isBlank();
        admission.setAttenderName(req.getAttenderName());
        admission.setAttenderPhone(req.getAttenderPhone());
        admission.setAttenderRelationship(req.getAttenderRelationship());
        Admission saved = admissionRepository.save(admission);

        if (saved.getRoom() != null) {
            Room r = saved.getRoom();
            roomLogRepository.save(com.zenlocare.clinics.entity.RoomLog.builder()
                    .room(r)
                    .hospital(saved.getHospital())
                    .event(isNew
                            ? com.zenlocare.clinics.entity.RoomLogEvent.ATTENDER_ASSIGNED
                            : com.zenlocare.clinics.entity.RoomLogEvent.ATTENDER_UPDATED)
                    .roomNumber(r.getRoomNumber())
                    .patientName(saved.getPatient() != null
                            ? saved.getPatient().getFirstName() + " " + saved.getPatient().getLastName()
                            : null)
                    .patientUhid(saved.getPatient() != null ? saved.getPatient().getUhid() : null)
                    .attenderName(req.getAttenderName())
                    .performedBy(performedBy)
                    .build());
        }

        return toDTO(saved);
    }
}
