package com.zenlocare.clinics.util;

import com.zenlocare.clinics.entity.Doctor;
import com.zenlocare.clinics.entity.User;

/**
 * Renders a person's display name for the {@code *_name_snapshot} columns.
 *
 * <p>Exists so every write site produces the <em>same</em> string. These names
 * are frozen onto clinical and financial records at write time, so an
 * inconsistent format here would show up as inconsistent history later — and
 * unlike a live join, it could not be corrected by fixing the formatter.
 *
 * <p><b>Format is deliberately "First Last", with no "Dr." prefix.</b> That
 * matches what the existing read paths already emit, so freezing the value
 * changes nothing on screen. Titles belong to presentation and are added by
 * the UI where wanted — baking one into stored data would be storing
 * presentation rather than fact.
 *
 * <p>Null-safe throughout: a missing person yields {@code null} (the FK is
 * nullable in these tables, so absence is legitimate), and a missing surname
 * yields just the given name rather than the literal {@code "John null"} that
 * naive concatenation produced.
 *
 * <p>Ported from HMS, where this is the single canonical formatter for every
 * snapshot column (4 call sites there: MedicationAdministrationController,
 * RecordController, RecordService, AdmissionService). Invoice.patientNameSnapshot
 * and Admission.admittingDoctorNameSnapshot were fixed in clinics before this
 * utility was ported and still inline the same logic rather than call it —
 * not wrong, just not deduplicated. New snapshot fields should use this.
 */
public final class PersonNames {

    private PersonNames() {
    }

    /** "First Last" for a user, or null if there is no user. */
    public static String of(User user) {
        if (user == null) {
            return null;
        }
        String first = user.getFirstName() != null ? user.getFirstName() : "";
        String last = user.getLastName() != null ? " " + user.getLastName() : "";
        String name = (first + last).trim();
        return name.isEmpty() ? null : name;
    }

    /**
     * "First Last" for a doctor. A Doctor carries no name of its own — the name
     * lives on the linked {@link User} — so this walks {@code doctor.user}.
     */
    public static String of(Doctor doctor) {
        return doctor == null ? null : of(doctor.getUser());
    }

    /** Role display name at the time of writing, or null if unavailable. */
    public static String roleOf(User user) {
        if (user == null || user.getRole() == null) {
            return null;
        }
        return user.getRole().getDisplayName();
    }
}
