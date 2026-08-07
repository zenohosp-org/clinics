package com.zenlocare.clinics.service;

import com.zenlocare.clinics.entity.*;
import com.zenlocare.clinics.exception.ConflictException;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final HospitalRepository hospitalRepository;
    private final DepartmentRepository departmentRepository;
    private final DesignationRepository designationRepository;
    private final PasswordEncoder passwordEncoder;

    public List<User> getUsersByHospital(UUID hospitalId) {
        return userRepository.findByHospitalId(hospitalId);
    }

    public User getUserById(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));
    }

    public List<User> searchUsers(UUID hospitalId, String query, String role) {
        if (query == null || query.trim().isEmpty()) {
            if (role != null && !role.trim().isEmpty()) {
                return userRepository.findByHospitalIdAndRoleName(hospitalId, role);
            }
            return userRepository.findByHospitalId(hospitalId);
        }
        org.springframework.data.domain.Pageable limit = org.springframework.data.domain.PageRequest.of(0, 20);
        return userRepository.searchUsers(hospitalId, query.trim(), role, limit);
    }

    @Transactional
    public User createUser(String email, String password, String firstName, String lastName,
            String roleName, UUID hospitalId, String phone, String employeeCode, String designation,
            String gender, java.time.LocalDate dateOfJoining, UUID branchId, UUID departmentId, UUID designationId,
            String aadhaarNumber, String panNumber, String workEmail) {

        final String normalizedEmail = email != null ? email.toLowerCase().trim() : null;
        final String normalizedRoleName = roleName != null ? roleName.toLowerCase().trim() : null;

        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new ConflictException("Email already exists: " + normalizedEmail);
        }

        Role role = roleRepository.findByName(normalizedRoleName)
                .orElseThrow(() -> new ResourceNotFoundException("Role not found: " + normalizedRoleName));

        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Hospital not found"));

        Department dept = departmentId != null
                ? departmentRepository.findById(departmentId).orElse(null) : null;
        Designation desig = designationId != null
                ? designationRepository.findById(designationId).orElse(null) : null;

        User user = User.builder()
                .email(normalizedEmail)
                .workEmail(workEmail != null && !workEmail.isBlank() ? workEmail.toLowerCase().trim() : null)
                .passwordHash(passwordEncoder.encode(password != null ? password : "defaultPassword123"))
                .firstName(firstName)
                .lastName(lastName)
                .role(role)
                .hospital(hospital)
                .phone(phone)
                .employeeCode(employeeCode)
                .designation(designation)
                .gender(gender)
                .dateOfJoining(dateOfJoining)
                .branchId(branchId)
                .department(dept)
                .designationRef(desig)
                .aadhaarNumber(aadhaarNumber != null ? aadhaarNumber.replaceAll("\\D", "") : null)
                .panNumber(panNumber != null ? panNumber.trim().toUpperCase() : null)
                .isActive(true)
                .build();

        return userRepository.save(user);
    }

    @Transactional
    public User updateUser(UUID userId, String firstName, String lastName, String phone,
            String roleName, String employeeCode, String designation,
            String gender, java.time.LocalDate dateOfJoining, String state,
            UUID departmentId, UUID designationId, String aadhaarNumber, String panNumber,
            String workEmail) {
        User user = getUserById(userId);

        if (workEmail != null) user.setWorkEmail(workEmail.isBlank() ? null : workEmail);
        if (firstName != null) user.setFirstName(firstName);
        if (lastName != null) user.setLastName(lastName);
        if (phone != null) user.setPhone(phone);
        if (employeeCode != null) user.setEmployeeCode(employeeCode);
        if (designation != null) user.setDesignation(designation);
        if (gender != null) user.setGender(gender);
        if (dateOfJoining != null) user.setDateOfJoining(dateOfJoining);
        if (state != null) user.setState(state);
        if (departmentId != null) {
            user.setDepartment(departmentRepository.findById(departmentId).orElse(null));
        }
        if (designationId != null) {
            user.setDesignationRef(designationRepository.findById(designationId).orElse(null));
        }
        user.setAadhaarNumber(aadhaarNumber != null ? aadhaarNumber.replaceAll("\\D", "") : null);
        user.setPanNumber(panNumber != null ? panNumber.trim().toUpperCase() : null);
        if (roleName != null && !roleName.isBlank()) {
            Role role = roleRepository.findByName(roleName.toLowerCase().trim())
                    .orElseThrow(() -> new ResourceNotFoundException("Role not found: " + roleName));
            user.setRole(role);
        }

        return userRepository.save(user);
    }

    @Transactional
    public void deactivateUser(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        user.setIsActive(false);
        userRepository.save(user);
    }

    @Transactional
    public void activateUser(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        user.setIsActive(true);
        userRepository.save(user);
    }
}
