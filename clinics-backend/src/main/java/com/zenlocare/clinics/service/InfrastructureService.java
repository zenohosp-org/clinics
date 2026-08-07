package com.zenlocare.clinics.service;

import com.zenlocare.clinics.controller.InfrastructureController.BuildingDto;
import com.zenlocare.clinics.controller.InfrastructureController.FloorDto;
import com.zenlocare.clinics.controller.InfrastructureController.RoomDto;
import com.zenlocare.clinics.controller.InfrastructureController.WardDto;
import com.zenlocare.clinics.entity.*;
import com.zenlocare.clinics.integration.AssetsClient;
import com.zenlocare.clinics.repository.*;
import com.zenlocare.clinics.exception.InfrastructureValidationException;
import com.zenlocare.clinics.controller.InfrastructureController.ValidationRequest;
import com.zenlocare.clinics.controller.InfrastructureController.ValidationResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class InfrastructureService {

    /**
     * Room types that should produce a row in the `stores` table so cross-module
     * consumers (Pharmacy, Blood Bank) can find their canonical store by type.
     *
     * Don't include INVENTORY here — that namespace belongs to the Inventory
     * module which writes its own rows; HMS shouldn't be authoring them. Pharmacy
     * reads where type='PHARMACY'; if HMS forces every row to "STORE" (the old
     * bug) the pharmacy default-store lookup returns nothing and falls back to a
     * confusing first-batch heuristic.
     */
    private static final Set<String> STORE_LIKE_ROOM_TYPES = Set.of(
            "STORE", "PHARMACY", "PHARMACY_INV", "BLOOD_BANK"
    );

    private final HospitalBuildingRepository buildingRepo;
    private final HospitalFloorRepository floorRepo;
    private final HospitalWardRepository wardRepo;
    private final HospitalRepository hospitalRepo;
    private final RoomRepository roomRepo;
    private final BedRepository bedRepo;
    private final StoreRepository storeRepo;
    private final AdmissionRepository admissionRepo;
    private final OtBookingRepository otBookingRepo;
    private final AssetsClient assetsClient;

    @Transactional(readOnly = true)
    public List<BuildingDto> get(UUID hospitalId, boolean includeInactive) {
        List<HospitalBuilding> buildings = buildingRepo.findByHospitalIdWithDetails(hospitalId);
        return buildings.stream()
                .filter(b -> includeInactive || Boolean.TRUE.equals(b.getIsActive()))
                .map(b -> toDto(b, hospitalId, includeInactive))
                .collect(Collectors.toList());
    }

    @Transactional
    public List<BuildingDto> save(UUID hospitalId, List<BuildingDto> dtos) {
        Hospital hospital = hospitalRepo.getReferenceById(hospitalId);
        List<HospitalBuilding> allBuildings = buildingRepo.findByHospitalIdWithDetails(hospitalId);
        
        Set<Long> activeBuildingIds = new HashSet<>();
        Set<Long> activeFloorIds = new HashSet<>();
        Set<Long> activeWardIds = new HashSet<>();
        Set<Long> activeRoomIds = new HashSet<>();
        Set<Long> activeBedIds = new HashSet<>();

        // 1. First, we need to collect all Room IDs and Bed IDs that are going to be removed
        // so we can validate them in one pass before changing anything in DB.
        List<Long> roomsToRemove = new ArrayList<>();
        List<Long> bedsToRemove = new ArrayList<>();
        
        // Let's populate active IDs by simulating the payload traversal without saving
        Set<Long> incomingRoomIds = new HashSet<>();
        Set<Long> incomingBedIds = new HashSet<>();
        for (BuildingDto bDto : dtos) {
            for (FloorDto fDto : bDto.getFloors()) {
                for (WardDto wDto : fDto.getWards()) {
                    for (RoomDto rDto : wDto.getRooms()) {
                        if (rDto.getId() != null) incomingRoomIds.add(rDto.getId());
                        for (com.zenlocare.clinics.controller.InfrastructureController.InfraBedDto b : rDto.getBeds()) {
                            if (b.getId() != null) incomingBedIds.add(b.getId());
                        }
                    }
                    for (com.zenlocare.clinics.controller.InfrastructureController.InfraBedDto b : wDto.getBeds()) {
                        if (b.getId() != null) incomingBedIds.add(b.getId());
                    }
                }
            }
        }
        
        List<Room> allPrevInfraRooms = roomRepo.findByHospitalIdAndHospitalWardIsNotNull(hospitalId);
        for (Room room : allPrevInfraRooms) {
            if (!incomingRoomIds.contains(room.getId()) && Boolean.TRUE.equals(room.getIsActive())) {
                roomsToRemove.add(room.getId());
            }
        }
        // Since we don't have a hospital-wide bed query, we will rely on validation inside the save loop
        // But the prompt wants us to block the SAVE flow.
        ValidationRequest vReq = new ValidationRequest();
        vReq.setRoomIds(roomsToRemove);
        // Wait, the validation logic needs beds too. 
        // Let's defer beds to a lazy check, or we can just run the check directly inside the save loops below.
        // Actually, the prompt says: "In InfrastructureService.save(), before marking any room or bed as is_active = false, run these checks:"
        // So we can just do it right where they are marked.

        for (int i = 0; i < dtos.size(); i++) {
            BuildingDto bDto = dtos.get(i);
            HospitalBuilding building = allBuildings.stream()
                .filter(b -> bDto.getId() != null ? b.getId().equals(bDto.getId()) : b.getName().equals(bDto.getName()))
                .findFirst()
                .orElseGet(() -> {
                    HospitalBuilding newB = new HospitalBuilding();
                    newB.setHospital(hospital);
                    newB.setFloors(new ArrayList<>());
                    allBuildings.add(newB);
                    return newB;
                });
            
            building.setName(bDto.getName());
            building.setDisplayOrder(i);
            building.setIsActive(true);
            
            building = buildingRepo.saveAndFlush(building);
            activeBuildingIds.add(building.getId());
            
            for (int j = 0; j < bDto.getFloors().size(); j++) {
                FloorDto fDto = bDto.getFloors().get(j);
                final HospitalBuilding currentBuilding = building;
                HospitalFloor floor = building.getFloors().stream()
                    .filter(f -> fDto.getId() != null ? f.getId().equals(fDto.getId()) : f.getName().equals(fDto.getName()))
                    .findFirst()
                    .orElseGet(() -> {
                        HospitalFloor newF = new HospitalFloor();
                        newF.setBuilding(currentBuilding);
                        newF.setWards(new ArrayList<>());
                        currentBuilding.getFloors().add(newF);
                        return newF;
                    });
                
                floor.setHospital(building.getHospital());
                floor.setBuilding(building);
                floor.setName(fDto.getName());
                floor.setDisplayOrder(j);
                floor.setIsActive(true);
                floor = floorRepo.saveAndFlush(floor);
                activeFloorIds.add(floor.getId());

                for (int k = 0; k < fDto.getWards().size(); k++) {
                    WardDto wDto = fDto.getWards().get(k);
                    final HospitalFloor currentFloor = floor;
                    HospitalWard ward = floor.getWards().stream()
                        .filter(w -> wDto.getId() != null ? w.getId().equals(wDto.getId()) : w.getName().equals(wDto.getName()))
                        .findFirst()
                        .orElseGet(() -> {
                            HospitalWard newW = new HospitalWard();
                            newW.setFloor(currentFloor);
                            currentFloor.getWards().add(newW);
                            return newW;
                        });

                    ward.setHospital(floor.getHospital());
                    ward.setFloor(floor);
                    ward.setName(wDto.getName());
                    ward.setDailyCharge(wDto.getDailyCharge());
                    ward.setRoomType(wDto.getRoomType() != null ? wDto.getRoomType() : "GENERAL");
                    ward.setDisplayOrder(k);
                    ward.setIsActive(true);
                    ward = wardRepo.saveAndFlush(ward);
                    activeWardIds.add(ward.getId());

                    for (RoomDto rDto : wDto.getRooms()) {
                        Room room = null;
                        if (rDto.getId() != null) {
                            room = roomRepo.findById(rDto.getId()).orElse(null);
                        }
                        if (room == null) {
                            room = roomRepo.findByHospitalIdAndRoomNumber(hospitalId, rDto.getName()).orElse(null);
                        }
                        if (room == null) {
                            room = new Room();
                            room.setHospital(hospital);
                        }

                        room.setRoomNumber(rDto.getName());
                        room.setRoomType(ward.getRoomType());
                        room.setHospitalWard(ward);
                        if (ward.getDailyCharge() != null) {
                            room.setPricePerDay(ward.getDailyCharge());
                        }
                        room.setIsActive(true);
                        Room savedRoom = roomRepo.saveAndFlush(room);
                        activeRoomIds.add(savedRoom.getId());

                        List<Bed> beds = bedRepo.findByRoomIdOrderByBedNumberAsc(savedRoom.getId());
                        for (String bedName : rDto.getBedNames()) {
                            Bed bed = beds.stream()
                                .filter(b -> b.getBedNumber().equals(bedName))
                                .findFirst()
                                .orElseGet(() -> {
                                    Bed newBed = new Bed();
                                    newBed.setRoom(savedRoom);
                                    return newBed;
                                });
                            bed.setBedNumber(bedName);
                            bed.setIsActive(true);
                            bed.setWard(null);
                            // Set unconditionally — repairs any pre-existing row
                            // whose hospital_id was NULL (legacy from the bed-
                            // tracking refactor before the NOT NULL constraint
                            // landed), and sets it correctly on freshly minted beds.
                            bed.setHospital(hospital);
                            bed = bedRepo.saveAndFlush(bed);
                            activeBedIds.add(bed.getId());
                        }
                        
                        for (Bed bed : beds) {
                            if (!activeBedIds.contains(bed.getId()) && Boolean.TRUE.equals(bed.getIsActive())) {
                                if (admissionRepo.existsByBedIdAndStatus(bed.getId(), AdmissionStatus.ADMITTED)) {
                                    throw new InfrastructureValidationException(List.of("Bed '" + bed.getBedNumber() + "' cannot be removed: active admission"), List.of());
                                }
                                bed.setIsActive(false);
                                bedRepo.save(bed);
                            }
                        }

                        if (STORE_LIKE_ROOM_TYPES.contains(room.getRoomType())) {
                            Store store = storeRepo.findByRoomId(savedRoom.getId())
                                    .orElseGet(Store::new);
                            if (store.getId() == null) {
                                store.setRoomId(savedRoom.getId());
                            }
                            store.setHospital(hospital);
                            store.setName(savedRoom.getRoomNumber());
                            store.setIsActive(true);
                            store.setType(room.getRoomType()); // verbatim — Pharmacy/etc. filter by exact type
                            storeRepo.save(store);
                        } else {
                            storeRepo.findByRoomId(savedRoom.getId()).ifPresent(s -> {
                                s.setIsActive(false);
                                storeRepo.save(s);
                            });
                        }
                    }

                    if (wDto.getBedNames() != null) {
                        List<Bed> wardBeds = bedRepo.findByWardIdOrderByBedNumberAsc(ward.getId());
                        final HospitalWard finalWard = ward;
                        for (String bedName : wDto.getBedNames()) {
                            Bed bed = wardBeds.stream()
                                .filter(b -> b.getBedNumber().equals(bedName))
                                .findFirst()
                                .orElseGet(() -> {
                                    Bed newBed = new Bed();
                                    newBed.setWard(finalWard);
                                    return newBed;
                                });
                            bed.setWard(finalWard);
                            bed.setRoom(null);
                            bed.setBedNumber(bedName);
                            bed.setIsActive(true);
                            // See sibling block above — set unconditionally so the
                            // NOT NULL hospital_id constraint can't reject this row.
                            bed.setHospital(hospital);
                            bed = bedRepo.saveAndFlush(bed);
                            activeBedIds.add(bed.getId());
                        }

                        for (Bed bed : wardBeds) {
                            if (!activeBedIds.contains(bed.getId()) && Boolean.TRUE.equals(bed.getIsActive())) {
                                if (admissionRepo.existsByBedIdAndStatus(bed.getId(), AdmissionStatus.ADMITTED)) {
                                    throw new InfrastructureValidationException(List.of("Bed '" + bed.getBedNumber() + "' cannot be removed: active admission"), List.of());
                                }
                                bed.setIsActive(false);
                                bedRepo.save(bed);
                            }
                        }
                    }
                }
            }
        }

        List<Room> prevInfraRooms = roomRepo.findByHospitalIdAndHospitalWardIsNotNull(hospitalId);
        for (Room room : prevInfraRooms) {
            if (!activeRoomIds.contains(room.getId()) && Boolean.TRUE.equals(room.getIsActive())) {
                if (admissionRepo.existsByRoomIdAndStatus(room.getId(), AdmissionStatus.ADMITTED)) {
                    throw new InfrastructureValidationException(List.of("Room '" + room.getRoomNumber() + "' cannot be removed: active admission"), List.of());
                }
                if (otBookingRepo.existsByRoomIdAndStatusNotIn(room.getId(), List.of("COMPLETED", "CANCELLED"))) {
                    throw new InfrastructureValidationException(List.of("Room '" + room.getRoomNumber() + "' cannot be removed: active OT booking"), List.of());
                }
                room.setIsActive(false);
                roomRepo.save(room);
                
                Store store = storeRepo.findByRoomId(room.getId()).orElse(null);
                if (store != null) {
                    store.setIsActive(false);
                    storeRepo.save(store);
                }
            }
        }

        for (HospitalBuilding b : allBuildings) {
            if (!activeBuildingIds.contains(b.getId()) && Boolean.TRUE.equals(b.getIsActive())) {
                b.setIsActive(false);
                buildingRepo.save(b);
            }
            for (HospitalFloor f : b.getFloors()) {
                if (!activeFloorIds.contains(f.getId()) && Boolean.TRUE.equals(f.getIsActive())) {
                    f.setIsActive(false);
                    floorRepo.save(f);
                }
                for (HospitalWard w : f.getWards()) {
                    if (!activeWardIds.contains(w.getId()) && Boolean.TRUE.equals(w.getIsActive())) {
                        w.setIsActive(false);
                        wardRepo.save(w);
                    }
                }
            }
        }

        return get(hospitalId, false);
    }

    @Transactional(readOnly = true)
    public ValidationResponse validateRemoval(ValidationRequest req) {
        List<String> reasons = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        if (req.getRoomIds() != null && !req.getRoomIds().isEmpty()) {
            for (Long roomId : req.getRoomIds()) {
                Room room = roomRepo.findById(roomId).orElse(null);
                if (room != null) {
                    if (admissionRepo.existsByRoomIdAndStatus(roomId, AdmissionStatus.ADMITTED)) {
                        reasons.add(String.format("Room '%s' cannot be removed: active admission", room.getRoomNumber()));
                    }
                    if (otBookingRepo.existsByRoomIdAndStatusNotIn(roomId, List.of("COMPLETED", "CANCELLED"))) {
                        reasons.add(String.format("Room '%s' cannot be removed: active OT booking", room.getRoomNumber()));
                    }
                }
            }
            if (assetsClient.existsByRooms(req.getRoomIds())) {
                warnings.add("One or more rooms have assigned assets. They will become unlocated.");
            }
        }

        if (req.getBedIds() != null && !req.getBedIds().isEmpty()) {
            for (Long bedId : req.getBedIds()) {
                Bed bed = bedRepo.findById(bedId).orElse(null);
                if (bed != null) {
                    if (admissionRepo.existsByBedIdAndStatus(bedId, AdmissionStatus.ADMITTED)) {
                        reasons.add(String.format("Bed '%s' cannot be removed: active admission", bed.getBedNumber()));
                    }
                }
            }
        }

        ValidationResponse res = new ValidationResponse();
        res.setBlocked(!reasons.isEmpty());
        res.setReasons(reasons);
        res.setWarnings(warnings);
        return res;
    }

    private BuildingDto toDto(HospitalBuilding b, UUID hospitalId, boolean includeInactive) {
        BuildingDto dto = new BuildingDto();
        dto.setId(b.getId());
        dto.setName(b.getName());
        dto.setIsActive(b.getIsActive());
        dto.setFloors(b.getFloors().stream()
                .filter(f -> includeInactive || Boolean.TRUE.equals(f.getIsActive()))
                .map(f -> toDto(f, hospitalId, includeInactive))
                .collect(Collectors.toList()));
        return dto;
    }

    private FloorDto toDto(HospitalFloor f, UUID hospitalId, boolean includeInactive) {
        FloorDto dto = new FloorDto();
        dto.setId(f.getId());
        dto.setName(f.getName());
        dto.setIsActive(f.getIsActive());
        dto.setWards(f.getWards().stream()
                .filter(w -> includeInactive || Boolean.TRUE.equals(w.getIsActive()))
                .map(w -> toDto(w, hospitalId, includeInactive))
                .collect(Collectors.toList()));
        return dto;
    }

    private WardDto toDto(HospitalWard w, UUID hospitalId, boolean includeInactive) {
        WardDto dto = new WardDto();
        dto.setId(w.getId());
        dto.setName(w.getName());
        dto.setIsActive(w.getIsActive());
        dto.setDailyCharge(w.getDailyCharge());
        List<Room> wardRooms = roomRepo.findByHospitalWard_Id(w.getId());
        wardRooms = wardRooms.stream()
                .filter(r -> includeInactive || Boolean.TRUE.equals(r.getIsActive()))
                .collect(Collectors.toList());
                
        String wardType = w.getRoomType();
        if (wardType == null || wardType.isBlank()) {
            wardType = wardRooms.isEmpty() ? "GENERAL"
                    : Optional.ofNullable(wardRooms.get(0).getRoomType()).orElse("GENERAL");
        }
        dto.setRoomType(wardType);
        
        List<RoomDto> rooms = wardRooms.stream()
                .map(r -> {
                    RoomDto rd = new RoomDto();
                    rd.setId(r.getId());
                    rd.setName(r.getRoomNumber());
                    rd.setIsActive(r.getIsActive());
                    List<Bed> activeBeds = bedRepo.findByRoomIdOrderByBedNumberAsc(r.getId())
                            .stream()
                            .filter(bed -> includeInactive || Boolean.TRUE.equals(bed.getIsActive()))
                            .collect(Collectors.toList());
                    
                    List<String> bedNames = activeBeds.stream().map(Bed::getBedNumber).collect(Collectors.toList());
                    List<com.zenlocare.clinics.controller.InfrastructureController.InfraBedDto> infraBeds = activeBeds.stream().map(bed -> {
                        com.zenlocare.clinics.controller.InfrastructureController.InfraBedDto ib = new com.zenlocare.clinics.controller.InfrastructureController.InfraBedDto();
                        ib.setId(bed.getId());
                        ib.setName(bed.getBedNumber());
                        return ib;
                    }).collect(Collectors.toList());
                    
                    rd.setBedNames(bedNames);
                    rd.setBeds(infraBeds);
                    return rd;
                })
                .collect(Collectors.toList());
        dto.setRooms(rooms);
        
        List<Bed> activeWardBeds = bedRepo.findByWardIdOrderByBedNumberAsc(w.getId())
                .stream()
                .filter(bed -> bed.getRoom() == null && (includeInactive || Boolean.TRUE.equals(bed.getIsActive())))
                .collect(Collectors.toList());
                
        List<String> wardBedNames = activeWardBeds.stream().map(Bed::getBedNumber).collect(Collectors.toList());
        List<com.zenlocare.clinics.controller.InfrastructureController.InfraBedDto> wardInfraBeds = activeWardBeds.stream().map(bed -> {
            com.zenlocare.clinics.controller.InfrastructureController.InfraBedDto ib = new com.zenlocare.clinics.controller.InfrastructureController.InfraBedDto();
            ib.setId(bed.getId());
            ib.setName(bed.getBedNumber());
            return ib;
        }).collect(Collectors.toList());
        
        dto.setBedNames(wardBedNames);
        dto.setBeds(wardInfraBeds);
        
        return dto;
    }
}
