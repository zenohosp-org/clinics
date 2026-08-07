package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.service.UserService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import com.zenlocare.clinics.security.ProfileVisibility;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping
    public ResponseEntity<List<UserDto>> listUsers(@RequestParam UUID hospitalId) {
        List<User> users = userService.getUsersByHospital(hospitalId);
        List<UserDto> dtos = users.stream().map(this::mapToDto).collect(Collectors.toList());
        return ResponseEntity.ok(dtos);
    }

    @GetMapping("/{id}")
    public ResponseEntity<UserDto> getUser(@PathVariable UUID id) {
        User user = userService.getUserById(id);
        return ResponseEntity.ok(mapToDto(user));
    }

    @GetMapping("/search")
    public ResponseEntity<List<UserDto>> searchUsers(
            @RequestParam UUID hospitalId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String role) {
        List<User> users = userService.searchUsers(hospitalId, q, role);
        List<UserDto> dtos = users.stream().map(this::mapToDto).collect(Collectors.toList());
        return ResponseEntity.ok(dtos);
    }

    @PostMapping
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<UserDto> createUser(@RequestBody CreateUserRequest req) {
        User user = userService.createUser(
                req.getEmail(), req.getPassword(), req.getFirstName(), req.getLastName(),
                req.getRole(), req.getHospitalId(), req.getPhone(),
                req.getEmployeeCode(), req.getDesignation(), req.getGender(),
                req.getDateOfJoining(), req.getBranchId(), req.getDepartmentId(), req.getDesignationId(),
                req.getAadhaarNumber(), req.getPanNumber(), req.getWorkEmail());
        return ResponseEntity.ok(mapToDto(user));
    }

    @PatchMapping("/{id}/deactivate")
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<Void> deactivateUser(@PathVariable java.util.UUID id) {
        userService.deactivateUser(id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/activate")
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<Void> activateUser(@PathVariable java.util.UUID id) {
        userService.activateUser(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Admin-gated: the body carries {@code role}, so leaving this open let any
     * authenticated user rewrite their own role — or anyone else's. Self-service
     * profile editing has no caller today (the staff form is the only consumer),
     * so it wants a separate, field-limited endpoint if it's ever needed.
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('hospital_admin')")
    public ResponseEntity<UserDto> updateUser(@PathVariable UUID id, @RequestBody UserDto req) {
        User user = userService.updateUser(id, req.getFirstName(), req.getLastName(), req.getPhone(),
                req.getRole(), req.getEmployeeCode(), req.getDesignation(),
                req.getGender(), req.getDateOfJoining(), req.getState(),
                req.getDepartmentId(), req.getDesignationId(), req.getAadhaarNumber(), req.getPanNumber(),
                req.getWorkEmail());
        return ResponseEntity.ok(mapToDto(user));
    }

    private UserDto mapToDto(User user) {
        boolean privileged = ProfileVisibility.maySeePrivateFieldsOf(user.getId());

        UserDto dto = new UserDto();
        dto.setId(user.getId().toString());
        // Work address is roster data; the login address is personal.
        dto.setWorkEmail(user.getWorkEmail());
        dto.setEmail(privileged ? user.getEmail() : null);
        dto.setFirstName(user.getFirstName());
        dto.setLastName(user.getLastName());
        dto.setRole(user.getRole().getName());
        dto.setRoleDisplay(user.getRole().getDisplayName());
        dto.setPhone(privileged ? user.getPhone() : null);
        dto.setIsActive(user.getIsActive());
        dto.setState(user.getState());
        dto.setEmployeeCode(user.getEmployeeCode());
        dto.setDesignation(user.getDesignation());
        dto.setGender(user.getGender());
        dto.setDateOfJoining(user.getDateOfJoining());
        dto.setBranchId(user.getBranchId());
        dto.setLastLoginAt(privileged ? user.getLastLoginAt() : null);
        if (user.getDepartment() != null) {
            dto.setDepartmentId(user.getDepartment().getId());
            dto.setDepartmentName(user.getDepartment().getName());
            dto.setDepartmentType(user.getDepartment().getType().name());
        }
        if (user.getDesignationRef() != null) {
            dto.setDesignationId(user.getDesignationRef().getId());
            dto.setDesignationName(user.getDesignationRef().getName());
            dto.setDesignationCategory(user.getDesignationRef().getCategory().name());
        }
        // Government IDs never leave the building for a colleague, even a
        // curious one with the network tab open.
        dto.setAadhaarNumber(privileged ? user.getAadhaarNumber() : null);
        dto.setPanNumber(privileged ? user.getPanNumber() : null);
        return dto;
    }

    @Data
    public static class CreateUserRequest {
        private String email;
        private String workEmail;
        private String password;
        private String firstName;
        private String lastName;
        private String role;
        private UUID hospitalId;
        private String phone;
        private String employeeCode;
        private String designation;
        private String gender;
        private java.time.LocalDate dateOfJoining;
        private UUID branchId;
        private UUID departmentId;
        private UUID designationId;
        private String aadhaarNumber;
        private String panNumber;
    }

    @Data
    public static class UserDto {
        private String id;
        /** Personal/login address — null unless the caller is the user or an admin. */
        private String email;
        /** Official address, visible hospital-wide. */
        private String workEmail;
        private String firstName;
        private String lastName;
        private String role;
        private String roleDisplay;
        private Boolean isActive;
        private String phone;
        private String state;
        private String employeeCode;
        private String designation;
        private String gender;
        private java.time.LocalDate dateOfJoining;
        private UUID branchId;
        private UUID departmentId;
        private String departmentName;
        private String departmentType;
        private UUID designationId;
        private String designationName;
        private String designationCategory;
        private String aadhaarNumber;
        private String panNumber;
        private java.time.LocalDateTime lastLoginAt;
    }
}
