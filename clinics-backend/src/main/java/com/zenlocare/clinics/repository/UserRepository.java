package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Hospital;
import com.zenlocare.clinics.entity.User;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    // hospital is LAZY — eagerly fetch it (alongside the EAGER role, which
    // an explicit entity graph would otherwise demote to LAZY) since
    // login/auth flows read user.getHospital() outside a transaction
    // (open-in-view=false).
    @EntityGraph(attributePaths = {"hospital", "role"})
    Optional<User> findByEmail(String email);

    Optional<User> findByEmailAndHospitalId(String email, UUID hospitalId);

    List<User> findByHospitalId(UUID hospitalId);

    List<User> findByHospitalIdAndRoleName(UUID hospitalId, String roleName);

    List<User> findByRoleName(String roleName);

    long countByHospitalIdAndRoleName(UUID hospitalId, String roleName);

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(u) FROM User u WHERE u.hospital.id = :hospitalId AND u.role.name != 'super_admin' AND u.isActive = true")
    long countActiveStaffExcludingSuperAdmin(@org.springframework.data.repository.query.Param("hospitalId") UUID hospitalId);

    @org.springframework.data.jpa.repository.Query("SELECT r.displayName, COUNT(u) FROM User u JOIN u.role r WHERE u.hospital.id = :hospitalId AND r.name != 'super_admin' AND u.isActive = true GROUP BY r.displayName, r.name")
    List<Object[]> getStaffByRole(@org.springframework.data.repository.query.Param("hospitalId") UUID hospitalId);

    boolean existsByEmail(String email);

    boolean existsByEmailAndHospital(String email, Hospital hospital);

    @org.springframework.data.jpa.repository.Query("SELECT u FROM User u WHERE u.hospital.id = :hospitalId AND " +
            "(:role IS NULL OR u.role.name = :role) AND " +
            "(LOWER(u.firstName) LIKE LOWER(CONCAT('%', :searchTerm, '%')) " +
            "OR LOWER(u.lastName) LIKE LOWER(CONCAT('%', :searchTerm, '%')) " +
            "OR LOWER(u.email) LIKE LOWER(CONCAT('%', :searchTerm, '%')) " +
            "OR LOWER(u.phone) LIKE LOWER(CONCAT('%', :searchTerm, '%')))")
    List<User> searchUsers(
            @org.springframework.data.repository.query.Param("hospitalId") UUID hospitalId,
            @org.springframework.data.repository.query.Param("searchTerm") String searchTerm,
            @org.springframework.data.repository.query.Param("role") String role,
            org.springframework.data.domain.Pageable pageable);
}
