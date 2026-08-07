package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.dto.BedDto;
import com.zenlocare.clinics.dto.RoomAllocationRequest;
import com.zenlocare.clinics.dto.RoomCreateRequest;
import com.zenlocare.clinics.dto.RoomDto;
import com.zenlocare.clinics.dto.RoomLogDTO;
import com.zenlocare.clinics.entity.Room;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.service.RoomService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/rooms")
@RequiredArgsConstructor
public class RoomController {

    private final RoomService roomService;

    @GetMapping
    @PreAuthorize("hasAnyRole('hospital_admin', 'doctor', 'staff')")
    public ResponseEntity<List<RoomDto>> getRoomsForHospital(@RequestParam UUID hospitalId) {
        return ResponseEntity.ok(roomService.getRoomsForHospital(hospitalId));
    }

    @GetMapping("/{roomId}/beds")
    @PreAuthorize("hasAnyRole('hospital_admin', 'doctor', 'staff')")
    public ResponseEntity<List<BedDto>> getBedsByRoom(@PathVariable Long roomId,
            @RequestParam UUID hospitalId) {
        return ResponseEntity.ok(roomService.getBedsByRoom(roomId, hospitalId));
    }

    @GetMapping("/beds/available")
    @PreAuthorize("hasAnyRole('hospital_admin', 'receptionist', 'doctor', 'nurse')")
    public ResponseEntity<List<BedDto>> getAvailableBeds(@AuthenticationPrincipal User user) {
        return ResponseEntity.ok(roomService.getAvailableBeds(user.getHospital().getId()));
    }

    @GetMapping("/beds/all")
    @PreAuthorize("hasAnyRole('hospital_admin', 'receptionist', 'doctor', 'nurse')")
    public ResponseEntity<List<BedDto>> getAllActiveBeds(@AuthenticationPrincipal User user) {
        return ResponseEntity.ok(roomService.getAllActiveBeds(user.getHospital().getId()));
    }


    @PostMapping("/generate")
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<List<Room>> generateRooms(@RequestBody RoomCreateRequest request,
            Authentication auth) {
        return ResponseEntity.ok(roomService.generateRooms(request, resolveFullName(auth)));
    }

    @PostMapping("/allocate")
    @PreAuthorize("hasAnyRole('hospital_admin', 'doctor', 'staff')")
    public ResponseEntity<RoomDto> allocatePatient(@RequestBody RoomAllocationRequest request,
            @RequestParam UUID hospitalId, Authentication auth) {
        return ResponseEntity.ok(roomService.allocatePatient(request, hospitalId, resolveFullName(auth)));
    }

    // PATCH /{roomId}/attender was removed — attender is now updated via
    // PUT /api/admissions/{id}/attender against the active admission.

    @PostMapping("/{roomId}/deallocate")
    @PreAuthorize("hasAnyRole('hospital_admin', 'doctor', 'staff')")
    public ResponseEntity<RoomDto> deallocatePatient(@PathVariable Long roomId,
            @RequestParam UUID hospitalId, Authentication auth) {
        return ResponseEntity.ok(roomService.deallocatePatient(roomId, hospitalId, resolveFullName(auth)));
    }

    @PostMapping("/beds/{bedId}/free")
    @PreAuthorize("hasAnyRole('hospital_admin', 'doctor', 'staff')")
    public ResponseEntity<BedDto> freeBed(@PathVariable Long bedId,
            @RequestParam UUID hospitalId, Authentication auth) {
        return ResponseEntity.ok(roomService.freeBed(bedId, hospitalId, resolveFullName(auth)));
    }

    @DeleteMapping("/{roomId}")
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<Void> deleteRoom(@PathVariable Long roomId,
            @RequestParam UUID hospitalId) {
        roomService.deleteRoom(roomId, hospitalId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/logs")
    @PreAuthorize("hasAnyRole('hospital_admin', 'doctor', 'staff')")
    public ResponseEntity<List<RoomLogDTO>> getHospitalLogs(@RequestParam UUID hospitalId,
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(roomService.getHospitalLogs(hospitalId, search));
    }

    @GetMapping("/{roomId}/logs")
    @PreAuthorize("hasAnyRole('hospital_admin', 'doctor', 'staff')")
    public ResponseEntity<List<RoomLogDTO>> getRoomLogs(@PathVariable Long roomId,
            @RequestParam UUID hospitalId) {
        return ResponseEntity.ok(roomService.getRoomLogs(roomId, hospitalId));
    }

    private String resolveFullName(Authentication auth) {
        if (auth != null && auth.getPrincipal() instanceof User user) {
            return user.getFirstName() + " " + user.getLastName();
        }
        return "System";
    }
}
