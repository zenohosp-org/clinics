package com.zenlocare.clinics.service;

import com.zenlocare.clinics.dto.BedDto;
import com.zenlocare.clinics.dto.RoomAllocationRequest;
import com.zenlocare.clinics.dto.RoomCreateRequest;
import com.zenlocare.clinics.dto.RoomDto;
import com.zenlocare.clinics.dto.RoomLogDTO;
import com.zenlocare.clinics.entity.*;
import com.zenlocare.clinics.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class RoomService {

    private final RoomRepository roomRepository;
    private final HospitalRepository hospitalRepository;
    private final PatientRepository patientRepository;
    private final RoomLogRepository roomLogRepository;
    private final DepartmentRepository departmentRepository;
    private final AdmissionRepository admissionRepository;
    private final BedRepository bedRepository;
    private final RoomTypeConfigRepository roomTypeConfigRepository;

    public List<RoomDto> getRoomsForHospital(UUID hospitalId) {
        List<Room> rooms = roomRepository.findByHospitalId(hospitalId).stream()
                .filter(r -> Boolean.TRUE.equals(r.getIsActive()))
                .collect(Collectors.toList());

        // Active admissions for this hospital, in one query. We bucket them
        // three ways:
        //   firstByRoomId          → arbitrary "current patient" per room
        //                             (preserves the old DTO field shape used
        //                             by the single-bed PRIVATE room card)
        //   bedLevelCountByRoomId  → how many admissions hold a specific bed
        //                             in this room — drives bedsOccupied
        //   roomLockedRoomIds      → rooms held by a bed-less admission, which
        //                             effectively occupies every bed
        Map<Long, Admission> firstByRoomId = new HashMap<>();
        Map<Long, Integer> bedLevelCountByRoomId = new HashMap<>();
        java.util.Set<Long> roomLockedRoomIds = new java.util.HashSet<>();
        for (Admission a : admissionRepository.findActiveAdmissionsByHospitalId(hospitalId)) {
            if (a.getRoom() == null) continue;
            Long roomId = a.getRoom().getId();
            firstByRoomId.putIfAbsent(roomId, a);
            if (a.getBed() != null) {
                bedLevelCountByRoomId.merge(roomId, 1, Integer::sum);
            } else {
                roomLockedRoomIds.add(roomId);
            }
        }

        // Beds physically present per room, batched into one query so the loop
        // below stays O(rooms) without per-row count() round-trips.
        Map<Long, Integer> bedsTotalByRoomId = new HashMap<>();
        for (Object[] row : bedRepository.countActiveBedsGroupedByRoom(hospitalId)) {
            if (row[0] == null) continue;
            bedsTotalByRoomId.put(((Number) row[0]).longValue(), ((Number) row[1]).intValue());
        }

        // Room-type configurations (category, hasBeds, hasDailyCharge) per type code.
        Map<String, RoomTypeConfig> configMap = new HashMap<>();
        for (RoomTypeConfig cfg : roomTypeConfigRepository.findActiveByHospitalId(hospitalId)) {
            configMap.put(cfg.getCode(), cfg);
        }

        return rooms.stream()
                .map(r -> {
                    int bedsTotal    = bedsTotalByRoomId.getOrDefault(r.getId(), 0);
                    int bedsOccupied = bedLevelCountByRoomId.getOrDefault(r.getId(), 0);
                    boolean roomLocked = roomLockedRoomIds.contains(r.getId());
                    return RoomDto.fromEntity(
                            r,
                            firstByRoomId.get(r.getId()),
                            configMap.get(r.getRoomType()),
                            bedsTotal,
                            bedsOccupied,
                            roomLocked);
                })
                .collect(Collectors.toList());
    }

    public List<BedDto> getBedsByRoom(Long roomId, UUID hospitalId) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));
        if (!room.getHospital().getId().equals(hospitalId)) {
            throw new RuntimeException("Room does not belong to this hospital");
        }
        List<Bed> beds = bedRepository.findByRoomIdOrderByBedNumberAsc(roomId);
        // Each occupied bed has its own admission; pull them in one query and
        // key by bed_id so BedDto can surface per-bed attender + admissionId.
        Map<Long, Admission> byBedId = new HashMap<>();
        for (Bed b : beds) {
            boolean occupied = admissionRepository.existsByBedIdAndStatus(b.getId(), AdmissionStatus.ADMITTED);
            if (occupied) {
                admissionRepository.findByBedIdAndStatus(b.getId(), AdmissionStatus.ADMITTED)
                        .ifPresent(a -> byBedId.put(b.getId(), a));
            }
        }
        // The room-level lock (bed-less admission) applies to every bed in the
        // room. Without setting this flag here, the right-panel bed list said
        // "0/3 occupied" with every bed Available while the Rooms card next to
        // it said "3/3 occupied" — same data, two answers. Single source of
        // truth: ask the repo once per room call.
        boolean roomLocked = admissionRepository.existsByRoomIdAndBedIdIsNullAndStatus(
                roomId, AdmissionStatus.ADMITTED);
        return beds.stream()
                .map(b -> BedDto.fromEntity(b, byBedId.get(b.getId()), roomLocked))
                .collect(Collectors.toList());
    }

    public List<BedDto> getAvailableBeds(UUID hospitalId) {
        return bedRepository.fetchAvailableBeds(hospitalId).stream()
                .map(bed -> BedDto.fromEntity(bed, null))
                .collect(Collectors.toList());
    }

    public List<BedDto> getAllActiveBeds(UUID hospitalId) {
        List<Bed> beds = bedRepository.fetchAllActiveBeds(hospitalId);
        Map<Long, Admission> byBedId = new HashMap<>();
        // Track which rooms are held by a bed-less admission so we can mark
        // every bed in that room as locked. Without this, beds in a held
        // room read as "AVAILABLE" in the picker and the backend later
        // rejects the allocation — that's the bug the user hit in IPD
        // admit (a single-bed PRIVATE room with an active admission that
        // never persisted a bed_id still surfaces its bed as pickable).
        java.util.Set<Long> roomsHeldWithoutBed = new java.util.HashSet<>();
        for (Bed b : beds) {
            boolean occupied = admissionRepository.existsByBedIdAndStatus(b.getId(), AdmissionStatus.ADMITTED);
            if (occupied) {
                admissionRepository.findByBedIdAndStatus(b.getId(), AdmissionStatus.ADMITTED)
                        .ifPresent(a -> byBedId.put(b.getId(), a));
            }
            Long roomId = b.getRoom() != null ? b.getRoom().getId() : null;
            if (roomId != null && !roomsHeldWithoutBed.contains(roomId)
                    && admissionRepository.existsByRoomIdAndBedIdIsNullAndStatus(roomId, AdmissionStatus.ADMITTED)) {
                roomsHeldWithoutBed.add(roomId);
            }
        }
        return beds.stream()
                .map(b -> {
                    Long roomId = b.getRoom() != null ? b.getRoom().getId() : null;
                    boolean roomLocked = roomId != null && roomsHeldWithoutBed.contains(roomId);
                    return BedDto.fromEntity(b, byBedId.get(b.getId()), roomLocked);
                })
                .collect(Collectors.toList());
    }


    private String generateRoomCode(Hospital hospital) {
        String hospPrefix = HospitalIdPrefix.of(hospital);
        List<String> existing = roomRepository.findRoomCodes(hospital.getId());
        int maxSeq = existing.stream().mapToInt(this::extractTrailingSequence).max().orElse(0);
        return hospPrefix + "RM-" + String.format("%04d", maxSeq + 1);
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

    @Transactional
    public List<Room> generateRooms(RoomCreateRequest request, String performedBy) {
        Hospital hospital = hospitalRepository.findById(request.getHospitalId())
                .orElseThrow(() -> new RuntimeException("Hospital not found"));

        int bedCount = request.getBedCount() != null && request.getBedCount() > 0
                ? request.getBedCount() : 1;

        List<Room> newRooms = new ArrayList<>();
        for (int i = 1; i <= request.getCount(); i++) {
            String tempRoomNumber = request.getRoomPrefix() + "-" + String.format("%02d", i);
            int counter = i;
            while (roomRepository.findByHospitalIdAndRoomNumber(hospital.getId(), tempRoomNumber).isPresent()) {
                counter += 100;
                tempRoomNumber = request.getRoomPrefix() + "-" + String.format("%02d", counter);
            }

            Department dept = request.getDepartmentId() != null
                    ? departmentRepository.findById(request.getDepartmentId()).orElse(null) : null;

            Room room = Room.builder()
                    .hospital(hospital)
                    .roomNumber(tempRoomNumber)
                    .roomCode(generateRoomCode(hospital))
                    .roomType(request.getRoomType())
                    .pricePerDay(request.getPricePerDay())
                    .build();

            Room saved = roomRepository.save(room);
            newRooms.add(saved);

            for (int b = 1; b <= bedCount; b++) {
                bedRepository.save(Bed.builder()
                        .room(saved)
                        .bedNumber("Bed " + b)
                        .build());
            }

            roomLogRepository.save(RoomLog.builder()
                    .room(saved)
                    .hospital(hospital)
                    .event(RoomLogEvent.ROOM_CREATED)
                    .roomNumber(saved.getRoomNumber())
                    .performedBy(performedBy)
                    .build());
        }

        return newRooms;
    }

    @Transactional
    public RoomDto allocatePatient(RoomAllocationRequest request, UUID hospitalId, String performedBy) {
        Room room = roomRepository.findById(request.getRoomId())
                .orElseThrow(() -> new RuntimeException("Room not found"));

        if (!room.getHospital().getId().equals(hospitalId)) {
            throw new RuntimeException("Room does not belong to this hospital");
        }
        boolean isRoomAvailable = !room.isUnderMaintenance() && !admissionRepository.existsByRoomIdAndStatus(room.getId(), AdmissionStatus.ADMITTED);
        if (!isRoomAvailable) {
            throw new RuntimeException("Room is not available");
        }

        Patient patient = patientRepository.findById(request.getPatientId())
                .orElseThrow(() -> new RuntimeException("Patient not found"));

        if (!patient.getHospital().getId().equals(hospitalId)) {
            throw new RuntimeException("Patient does not belong to this hospital");
        }

        admissionRepository.findByPatientIdAndStatus(patient.getId(), AdmissionStatus.ADMITTED)
                .ifPresent(admission -> {
                    // Patient was previously in another room/bed.
                    // No need to clear status, just reassign them.
                });

        boolean isMultiBed = bedRepository.countByRoomId(room.getId()) > 1;
        Bed allocatedBed = null;

        if (isMultiBed) {
            Bed bed;
            if (request.getBedId() != null) {
                bed = bedRepository.findById(request.getBedId())
                        .orElseThrow(() -> new RuntimeException("Bed not found"));
                boolean isBedAvailable = !bed.isUnderMaintenance() && !admissionRepository.existsByBedIdAndStatus(bed.getId(), AdmissionStatus.ADMITTED);
                if (!isBedAvailable) {
                    throw new RuntimeException("Selected bed is not available");
                }
            } else {
                bed = bedRepository.findByRoomIdOrderByBedNumberAsc(room.getId()).stream()
                        .filter(b -> !b.isUnderMaintenance() && !admissionRepository.existsByBedIdAndStatus(b.getId(), AdmissionStatus.ADMITTED))
                        .findFirst()
                        .orElseThrow(() -> new RuntimeException("No available beds in this room"));
            }
            allocatedBed = bed;
        } else {
            // Find the only bed
            Optional<Bed> singleBed = bedRepository.findByRoomIdOrderByBedNumberAsc(room.getId()).stream().findFirst();
            if (singleBed.isPresent()) {
                allocatedBed = singleBed.get();
            }
        }

        Room saved = roomRepository.save(room);

        // Sync room + bed + attender to the active admission. Attender lives
        // here now (Room.attender_* columns were dropped), so an allocation
        // that included attender fields writes them straight to the admission.
        final Bed finalBed = allocatedBed;
        Optional<Admission> activeAdmission = admissionRepository.findByPatientIdAndStatus(
                patient.getId(), AdmissionStatus.ADMITTED);
        activeAdmission.ifPresent(admission -> {
            admission.setRoom(saved);
            admission.setBed(finalBed);
            if (request.getAttenderName() != null && !request.getAttenderName().isBlank()) {
                admission.setAttenderName(request.getAttenderName());
                admission.setAttenderPhone(request.getAttenderPhone());
                admission.setAttenderRelationship(request.getAttenderRelationship());
            }
            admissionRepository.save(admission);
        });

        roomLogRepository.save(RoomLog.builder()
                .room(saved)
                .hospital(saved.getHospital())
                .event(RoomLogEvent.ALLOCATED)
                .roomNumber(saved.getRoomNumber())
                .patientName(patient.getFirstName() + " " + patient.getLastName())
                .patientUhid(patient.getUhid())
                .attenderName(request.getAttenderName())
                .allocationToken(null)
                .performedBy(performedBy)
                .build());

        return RoomDto.fromEntity(saved, activeAdmission.orElse(null), getRoomTypeConfig(saved.getRoomType(), hospitalId));
    }

    @Transactional
    public RoomDto deallocatePatient(Long roomId, UUID hospitalId, String performedBy) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));

        if (!room.getHospital().getId().equals(hospitalId)) {
            throw new RuntimeException("Room does not belong to this hospital");
        }

        Admission activeAdmission = admissionRepository.findByRoomIdAndStatus(roomId, AdmissionStatus.ADMITTED).orElse(null);
        String patientName = activeAdmission != null && activeAdmission.getPatient() != null
                ? activeAdmission.getPatient().getFirstName() + " " + activeAdmission.getPatient().getLastName()
                : null;
        String patientUhid = activeAdmission != null && activeAdmission.getPatient() != null ? activeAdmission.getPatient().getUhid() : null;

        Room saved = room;

        admissionRepository.findByRoomIdAndStatus(roomId, AdmissionStatus.ADMITTED)
                .ifPresent(admission -> {
                    admission.setStatus(AdmissionStatus.DISCHARGED);
                    admission.setActualDischargeDate(LocalDateTime.now());
                    admissionRepository.save(admission);
                });

        roomLogRepository.save(RoomLog.builder()
                .room(saved)
                .hospital(saved.getHospital())
                .event(RoomLogEvent.DEALLOCATED)
                .roomNumber(saved.getRoomNumber())
                .patientName(patientName)
                .patientUhid(patientUhid)
                .performedBy(performedBy)
                .build());

        // Active admission is now DISCHARGED; pass null so the DTO clears attender.
        return RoomDto.fromEntity(saved, null, getRoomTypeConfig(saved.getRoomType(), hospitalId));
    }

    private RoomTypeConfig getRoomTypeConfig(String roomType, UUID hospitalId) {
        return roomTypeConfigRepository.findByHospitalIdAndCode(hospitalId, roomType)
            .orElseGet(() -> roomTypeConfigRepository.findSystemByCode(roomType)
                .orElse(null));
    }

    @Transactional
    public BedDto freeBed(Long bedId, UUID hospitalId, String performedBy) {
        Bed bed = bedRepository.findById(bedId)
                .orElseThrow(() -> new RuntimeException("Bed not found"));

        Room room = bed.getRoom();
        if (!room.getHospital().getId().equals(hospitalId)) {
            throw new RuntimeException("Bed does not belong to this hospital");
        }

        Admission activeAdmission = admissionRepository.findByBedIdAndStatus(bedId, AdmissionStatus.ADMITTED).orElse(null);
        String patientName = activeAdmission != null && activeAdmission.getPatient() != null
                ? activeAdmission.getPatient().getFirstName() + " " + activeAdmission.getPatient().getLastName()
                : null;
        String patientUhid = activeAdmission != null && activeAdmission.getPatient() != null ? activeAdmission.getPatient().getUhid() : null;

        // Close the bed's admission before clearing the bed — keeps the
        // admission record + attender history intact.
        admissionRepository.findByBedIdAndStatus(bedId, AdmissionStatus.ADMITTED)
                .ifPresent(a -> {
                    a.setStatus(AdmissionStatus.DISCHARGED);
                    a.setActualDischargeDate(LocalDateTime.now());
                    admissionRepository.save(a);
                });



        roomLogRepository.save(RoomLog.builder()
                .room(room)
                .hospital(room.getHospital())
                .event(RoomLogEvent.DEALLOCATED)
                .roomNumber(room.getRoomNumber())
                .patientName(patientName)
                .patientUhid(patientUhid)
                .performedBy(performedBy)
                .build());

        return BedDto.fromEntity(bed, null);
    }

    // updateAttender on Room was deleted — attender now lives on Admission;
    // see AdmissionService.updateAttender + PUT /api/admissions/{id}/attender.

    public List<RoomLogDTO> getHospitalLogs(UUID hospitalId, String search) {
        List<RoomLog> logs = (search != null && !search.isBlank())
                ? roomLogRepository.searchByHospital(hospitalId, search.trim())
                : roomLogRepository.findByHospitalIdOrderByCreatedAtDesc(hospitalId);
        return logs.stream().map(this::toDTO).collect(Collectors.toList());
    }

    public List<RoomLogDTO> getRoomLogs(Long roomId, UUID hospitalId) {
        return roomLogRepository.findByRoomIdOrderByCreatedAtDesc(roomId)
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    @Transactional
    public void deleteRoom(Long roomId, UUID hospitalId) {
        Room room = roomRepository.findById(roomId)
                .filter(r -> r.getHospital().getId().equals(hospitalId))
                .orElseThrow(() -> new IllegalArgumentException("Room not found"));
        boolean isOccupied = admissionRepository.existsByRoomIdAndStatus(roomId, AdmissionStatus.ADMITTED);
        if (isOccupied) {
            throw new IllegalStateException("Cannot delete an occupied room. Deallocate the patient first.");
        }
        admissionRepository.findByRoomId(roomId).forEach(a -> {
            a.setRoom(null);
            admissionRepository.save(a);
        });
        roomLogRepository.deleteByRoomId(roomId);
        roomRepository.delete(room);
    }

    private RoomLogDTO toDTO(RoomLog log) {
        return RoomLogDTO.builder()
                .id(log.getId())
                .roomId(log.getRoom().getId())
                .roomNumber(log.getRoomNumber())
                .event(log.getEvent().name())
                .patientName(log.getPatientName())
                .patientUhid(log.getPatientUhid())
                .attenderName(log.getAttenderName())
                .allocationToken(log.getAllocationToken())
                .performedBy(log.getPerformedBy())
                .createdAt(log.getCreatedAt())
                .build();
    }

    private String generateToken() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder token = new StringBuilder(8);
        for (int i = 0; i < 8; i++) {
            token.append(chars.charAt(ThreadLocalRandom.current().nextInt(chars.length())));
        }
        return token.toString();
    }
}
