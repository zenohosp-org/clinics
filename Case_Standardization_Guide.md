# Developer Guide: Case Standardization (Lower to Upper)

To ensure consistency across the database, JWT tokens, and frontend routing, we standardized specific identifiers to **UPPERCASE**. This prevents "duplicate" records like "doctor" and "DOCTOR" from causing system errors.

---

### 1. Hospital Codes
When a new hospital is created, its unique identifier (code) is always converted to uppercase.
*   **File:** [HospitalService.java](file:///c:/Users/Karthikeyan%20M/Desktop/ZenloDirec/zenohosp/src/main/java/com/zenlocare/zenohosp/service/HospitalService.java)
*   **Logic:** `request.getCode().toUpperCase()`
*   **Example:** If a junior developer enters "apollo", it is saved as "APOLLO".

---

### 2. Personal Workspace Codes
For users who sign up via Google SSO without an invitation, a random personal workspace is created. The unique code for this workspace is standardized to uppercase.
*   **File:** [AuthService.java](file:///c:/Users/Karthikeyan%20M/Desktop/ZenloDirec/zenohosp/src/main/java/com/zenlocare/zenohosp/service/AuthService.java)
*   **Logic:** `personalCode.toUpperCase()`
*   **Example:** A random string like "x7y2z9" becomes "X7Y2Z9".

---

### 3. Role-Based Authorities (JWT)
When the system reads a user's role to check permissions, it converts the role name to uppercase to match Spring Security's naming convention for authorities.
*   **File:** [JwtFilter.java](file:///c:/Users/Karthikeyan%20M/Desktop/ZenloDirec/zenohosp/src/main/java/com/zenlocare/zenohosp/security/JwtFilter.java)
*   **Logic:** `new SimpleGrantedAuthority("ROLE_" + role.toUpperCase())`
*   **Example:** A role in the database "Doctor" becomes the authority "ROLE_DOCTOR".

---

### 4. Data Seeding (Static Identifiers)
The initial setup data for the system uses uppercase strings for all core roles and module codes.
*   **File:** [DataSeeder.java](file:///c:/Users/Karthikeyan%20M/Desktop/ZenloDirec/zenohosp/src/main/java/com/zenlocare/zenohosp/config/DataSeeder.java)
*   **Standardized Values:** 
    *   `SUPER_ADMIN`
    *   `HOSPITAL_ADMIN`
    *   `DOCTOR`
    *   `STAFF`
    *   `HMS` (Module Code)
    *   `OT` (Module Code)

---

### Best Practice for Juniors
Always use `.toUpperCase()` when performing a lookup or saving a new identifier (like a role name or hospital code) to the database. This ensures that the [findFirstByNameIgnoreCase](file:///c:/Users/Karthikeyan%20M/Desktop/ZenloDirec/zenohosp/src/main/java/com/zenlocare/zenohosp/repository/RoleRepository.java#10-11) method always finds the correct record regardless of how the user typed it.
