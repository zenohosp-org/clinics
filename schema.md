# HMS Backend — Database Setup Guide

---

## How to Run

```bat
# From HMS-backend folder — double-click or run in terminal:
run_backend.bat

# Or manually:
cd HMS-backend\HMS-backend
.\mvnw.cmd spring-boot:run
```

Backend starts at → `http://localhost:8080`

---

## How It Works

In Spring Boot with JPA, **you don't create tables manually**.
You write Java `@Entity` classes and Hibernate automatically creates the tables in PostgreSQL when the app starts.

---

## Step 1 — Create the Database

Open **pgAdmin** or **psql** and run this once:
```sql
CREATE DATABASE zenohms;
```
That's all. Hibernate handles everything else.

---

## Step 2 — `application.properties`

```properties
spring.application.name=zenohms

# Database
spring.datasource.url=jdbc:postgresql://localhost:5432/zenohms
spring.datasource.username=postgres
spring.datasource.password=YOUR_PASSWORD
spring.datasource.driver-class-name=org.postgresql.Driver

# JPA / Hibernate
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect
spring.jpa.properties.hibernate.format_sql=true

# JWT
jwt.secret=your-long-random-secret-key-min-32-chars
jwt.expiration=86400

# Cookie
jwt.cookie.name=ZENOHMS_TOKEN
jwt.cookie.secure=false
jwt.cookie.domain=localhost
```

> `ddl-auto=update` — Hibernate checks your `@Entity` classes on every start and creates/updates tables automatically.

---

## Step 3 — Entity Classes

Package: `src/main/java/com/zenlocare/HMS_backend/entity/`

---

### `Role.java`
```java
@Entity
@Table(name = "roles")
public class Role {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true, length = 50)
    private String name;        // "SUPER_ADMIN" | "HOSPITAL_ADMIN" | "DOCTOR" | "STAFF"

    private String displayName; // "Super Admin" | "Hospital Admin" | "Doctor" | "Staff"

    @Builder.Default
    private Boolean isSystemRole = false;
}
```

---

### `Hospital.java`
```java
@Entity
@Table(name = "hospital_master")
public class Hospital {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "hospital_id")
    private Integer id;

    @Column(name = "hospital_code", nullable = false, unique = true, length = 20)
    private String hospitalCode;

    @Column(name = "hospital_name", nullable = false, length = 150)
    private String hospitalName;

    @Column(columnDefinition = "TEXT")
    private String address;

    @Column(length = 20)
    private String phone;
}
```

---

### `User.java`
```java
@Entity
@Table(name = "users", uniqueConstraints = @UniqueConstraint(columnNames = {"email", "hospital_id"}))
public class User {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id")   // NULL for SUPER_ADMIN
    private Hospital hospital;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "role_id", nullable = false)
    private Role role;

    @Column(nullable = false)
    private String email;

    @Column(nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private String firstName;

    private String lastName;
    private String phone;
    private String specialization; // for doctors
    private String department;

    @Builder.Default private Boolean isActive = true;

    private LocalDateTime lastLoginAt;

    @Builder.Default @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void onUpdate() { this.updatedAt = LocalDateTime.now(); }
}
```

---

### `Patient.java`
```java
@Entity
@Table(name = "patients",
    uniqueConstraints = @UniqueConstraint(columnNames = {"hospital_id", "mrn"}))
public class Patient {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "patient_id")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    private Hospital hospital;

    @Column(nullable = false, length = 30)
    private String mrn;          // e.g. MRN-0001, unique per hospital

    @Column(name = "first_name", nullable = false, length = 50) private String firstName;
    @Column(name = "last_name",  nullable = false, length = 50) private String lastName;

    @Column(nullable = false) private LocalDate dob;
    @Column(nullable = false, length = 10) private String gender;
    @Column(length = 20)  private String phone;
    @Column(length = 100) private String email;
    @Column(name = "blood_group", length = 5) private String bloodGroup;
    @Column(columnDefinition = "TEXT") private String address;

    @Builder.Default @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
```

---

### `PatientRecord.java`
```java
@Entity
@Table(name = "patient_records")
public class PatientRecord {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "history_id")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false) private Hospital hospital;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "patient_id",  nullable = false) private Patient patient;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by",  nullable = false) private User createdBy;

    // CONSULTATION | PRESCRIPTION | LAB_RESULT | SURGERY | DIAGNOSIS | OTHERS
    @Column(name = "history_type", nullable = false, length = 50) private String historyType;
    @Column(columnDefinition = "TEXT") private String description;
    @Column(name = "next_visit_date")  private LocalDateTime nextVisitDate;

    @Builder.Default @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
```

---

### `Invitation.java`
```java
@Entity
@Table(name = "invitations")
public class Invitation {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "invitation_id")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false) private Hospital hospital;

    @Column(name = "invited_email", nullable = false, length = 255) private String invitedEmail;

    @Column(nullable = false, length = 50) private String role; // role name to assign

    @Column(nullable = false, unique = true, length = 255) private String token;

    @Builder.Default
    @Column(nullable = false, length = 20)
    private String status = "PENDING"; // PENDING | ACCEPTED | EXPIRED

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false) private User createdBy;

    @Column(name = "expires_at", nullable = false) private LocalDateTime expiresAt;

    @Builder.Default @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
```

---

## Step 4 — Repositories

Package: `src/main/java/com/zenlocare/HMS_backend/repository/`

```java
// RoleRepository.java
public interface RoleRepository extends JpaRepository<Role, UUID> {
    Optional<Role> findByName(String name);
    boolean existsByName(String name);
}

// HospitalRepository.java
public interface HospitalRepository extends JpaRepository<Hospital, Integer> {
    Optional<Hospital> findByHospitalCode(String code);
}

// UserRepository.java
public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);
    List<User> findByHospitalId(Integer hospitalId);
    List<User> findByHospitalIdAndRoleName(Integer hospitalId, String roleName);
    boolean existsByEmail(String email);
}

// PatientRepository.java
public interface PatientRepository extends JpaRepository<Patient, Integer> {
    List<Patient> findByHospitalId(Integer hospitalId);
    Optional<Patient> findByHospitalIdAndMrn(Integer hospitalId, String mrn);
    long countByHospitalId(Integer hospitalId);
}

// PatientRecordRepository.java
public interface PatientRecordRepository extends JpaRepository<PatientRecord, UUID> {
    List<PatientRecord> findByPatientId(Integer patientId);
    List<PatientRecord> findByPatientIdAndHospitalId(Integer patientId, Integer hospitalId);
}

// InvitationRepository.java
public interface InvitationRepository extends JpaRepository<Invitation, UUID> {
    Optional<Invitation> findByToken(String token);
    List<Invitation> findByHospitalId(Integer hospitalId);
    List<Invitation> findByInvitedEmailAndStatus(String email, String status);
}
```

---

## Step 5 — DataSeeder (Auto-runs on Startup)

> ⚠️ **Never insert passwords directly into the database via SQL.**
> Passwords must be BCrypt hashed. `DataSeeder` handles this automatically.

`DataSeeder` runs on every startup and is **idempotent** (skips already-existing data):

1. Seeds 4 system roles → `roles` table
2. Creates `ZENO` hospital + `SUPER_ADMIN` user (if not present)

**Default credentials:**
| Field | Value |
|-------|-------|
| Email | `zenosuperadmin@gmail.com` |
| Password | `admin123` |
| Role | `SUPER_ADMIN` |

---

## Tables Created by Hibernate

| Table | Entity | PK Type |
|-------|--------|---------|
| `roles` | `Role` | UUID |
| `hospital_master` | `Hospital` | Integer (serial) |
| `users` | `User` | UUID |
| `patients` | `Patient` | Integer (serial) |
| `patient_records` | `PatientRecord` | UUID |
| `invitations` | `Invitation` | UUID |

---

## Final Folder Structure

```
src/main/java/com/zenlocare/HMS_backend/
├── entity/
│   ├── Role.java
│   ├── Hospital.java
│   ├── User.java
│   ├── Patient.java
│   ├── PatientRecord.java
│   └── Invitation.java
├── repository/
│   ├── RoleRepository.java
│   ├── HospitalRepository.java
│   ├── UserRepository.java
│   ├── PatientRepository.java
│   ├── PatientRecordRepository.java
│   └── InvitationRepository.java
├── config/
│   └── DataSeeder.java
├── security/
│   ├── JwtUtil.java
│   ├── JwtAuthFilter.java
│   └── SecurityConfig.java
├── exception/
│   ├── GlobalExceptionHandler.java
│   ├── ResourceNotFoundException.java
│   ├── UnauthorizedException.java
│   ├── BadRequestException.java
│   └── ConflictException.java
├── dto/
│   ├── LoginRequest.java
│   ├── RegisterRequest.java
│   └── AuthResponse.java
├── service/
│   └── AuthService.java
└── controller/
    └── AuthController.java
```
