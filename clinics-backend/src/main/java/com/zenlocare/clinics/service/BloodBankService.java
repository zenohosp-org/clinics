package com.zenlocare.clinics.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zenlocare.clinics.dto.BloodBankDtos;
import com.zenlocare.clinics.entity.*;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Blood-bank domain service. Owns donor registry, bag lifecycle, and
 * issuance — which atomically flips status + auto-bills the receiving
 * patient (IPD-aware: appends to the active admission invoice; falls
 * back to a standalone OPD invoice for walk-ins).
 *
 * Lookup configuration (blood groups, components, statuses, donor types,
 * source types) is read via BloodBankLookupRepository. Component shelf
 * life lives in lookup.metadata.shelfLifeDays — drives expiry auto-calc
 * at bag registration.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BloodBankService {

    private static final int EXPIRY_WARN_DAYS = 7;
    private static final ObjectMapper JSON = new ObjectMapper();

    /**
     * Legal bag status transitions reachable via {@link #updateUnitStatus}.
     * ISSUED is reached only via {@link #issueUnit} and is a dead end here
     * (re-statusing an issued bag is rejected below); EXPIRED/DISCARDED are
     * terminal except EXPIRED → DISCARDED for write-off.
     */
    /** Components whose RBC content makes ABO/Rh donor antigens the deciding factor. */
    private static final Set<String> RBC_COMPONENTS = Set.of("WHOLE_BLOOD", "PRBC");

    /**
     * For RBC-containing components: recipient blood-group code → set of bag
     * blood-group codes that are safe to transfuse (standard ABO/Rh donor
     * compatibility; AB+ is the universal recipient, O- the universal donor).
     */
    private static final Map<String, Set<String>> RBC_COMPATIBLE_DONORS = Map.of(
            "O_NEG",  Set.of("O_NEG"),
            "O_POS",  Set.of("O_NEG", "O_POS"),
            "A_NEG",  Set.of("O_NEG", "A_NEG"),
            "A_POS",  Set.of("O_NEG", "O_POS", "A_NEG", "A_POS"),
            "B_NEG",  Set.of("O_NEG", "B_NEG"),
            "B_POS",  Set.of("O_NEG", "O_POS", "B_NEG", "B_POS"),
            "AB_NEG", Set.of("O_NEG", "A_NEG", "B_NEG", "AB_NEG"),
            "AB_POS", Set.of("O_NEG", "O_POS", "A_NEG", "A_POS", "B_NEG", "B_POS", "AB_NEG", "AB_POS")
    );

    /**
     * For plasma-bearing components (FFP, cryo, platelets): donor antibodies
     * matter, not antigens, so compatibility is ABO-only (Rh irrelevant) and
     * reversed from RBC — AB is the universal plasma donor, O the universal
     * plasma recipient. Keyed by recipient ABO letter → safe donor ABO letters.
     */
    private static final Map<String, Set<String>> PLASMA_COMPATIBLE_DONOR_ABO = Map.of(
            "O",  Set.of("O", "A", "B", "AB"),
            "A",  Set.of("A", "AB"),
            "B",  Set.of("B", "AB"),
            "AB", Set.of("AB")
    );

    private static final Map<String, Set<String>> ALLOWED_STATUS_TRANSITIONS = Map.of(
            "QUARANTINE", Set.of("AVAILABLE", "DISCARDED"),
            "AVAILABLE", Set.of("RESERVED", "EXPIRED", "DISCARDED"),
            "RESERVED", Set.of("AVAILABLE", "EXPIRED", "DISCARDED"),
            "EXPIRED", Set.of("DISCARDED"),
            "DISCARDED", Set.of(),
            "ISSUED", Set.of()
    );

    private final BloodBankLookupRepository lookupRepo;
    private final BloodDonorRepository donorRepo;
    private final BloodUnitRepository unitRepo;
    private final InvoiceRepository invoiceRepository;
    private final HospitalRepository hospitalRepository;
    private final PatientRepository patientRepository;
    private final AdmissionRepository admissionRepository;
    private final UserRepository userRepository;

    // ───── Lookups ────────────────────────────────────────────────────

    public List<BloodBankDtos.LookupDto> listLookups(UUID hospitalId, String lookupType) {
        return lookupRepo.findActiveByHospitalIdAndType(hospitalId, lookupType).stream()
                .map(this::toLookupDto)
                .toList();
    }

    private BloodBankDtos.LookupDto toLookupDto(BloodBankLookup l) {
        return BloodBankDtos.LookupDto.builder()
                .id(l.getId())
                .lookupType(l.getLookupType())
                .code(l.getCode())
                .label(l.getLabel())
                .metadata(l.getMetadata())
                .displayOrder(l.getDisplayOrder())
                .isSystem(Boolean.TRUE.equals(l.getIsSystem()))
                .isActive(Boolean.TRUE.equals(l.getIsActive()))
                .build();
    }

    // ───── Donors ─────────────────────────────────────────────────────

    public List<BloodBankDtos.DonorDto> listDonors(UUID hospitalId) {
        return donorRepo.findByHospital_IdOrderByCreatedAtDesc(hospitalId).stream()
                .map(this::toDonorDto)
                .toList();
    }

    public BloodBankDtos.DonorDto getDonor(UUID id, UUID hospitalId) {
        BloodDonor donor = donorRepo.findById(id)
                .filter(d -> d.getHospital().getId().equals(hospitalId))
                .orElseThrow(() -> new ResourceNotFoundException("Donor not found"));
        return toDonorDto(donor);
    }

    @Transactional
    public BloodBankDtos.DonorDto registerDonor(UUID hospitalId, BloodBankDtos.DonorRequest req) {
        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Hospital not found"));

        long existing = donorRepo.countByHospital_Id(hospitalId);
        String donorCode = "DON-" + String.format("%04d", existing + 1);

        BloodDonor donor = BloodDonor.builder()
                .hospital(hospital)
                .donorCode(donorCode)
                .firstName(req.getFirstName())
                .lastName(req.getLastName())
                .phone(req.getPhone())
                .email(req.getEmail())
                .dob(req.getDob())
                .gender(req.getGender())
                .bloodGroupCode(req.getBloodGroupCode())
                .donorTypeCode(req.getDonorTypeCode())
                .address(req.getAddress())
                .aadhaarNumber(req.getAadhaarNumber())
                .patientId(req.getPatientId())
                .isEligible(req.getIsEligible() != null ? req.getIsEligible() : true)
                .notes(req.getNotes())
                .build();

        return toDonorDto(donorRepo.save(donor));
    }

    @Transactional
    public BloodBankDtos.DonorDto updateDonor(UUID id, UUID hospitalId, BloodBankDtos.DonorRequest req) {
        BloodDonor donor = donorRepo.findById(id)
                .filter(d -> d.getHospital().getId().equals(hospitalId))
                .orElseThrow(() -> new ResourceNotFoundException("Donor not found"));
        if (req.getFirstName() != null) donor.setFirstName(req.getFirstName());
        if (req.getLastName() != null) donor.setLastName(req.getLastName());
        if (req.getPhone() != null) donor.setPhone(req.getPhone());
        if (req.getEmail() != null) donor.setEmail(req.getEmail());
        if (req.getDob() != null) donor.setDob(req.getDob());
        if (req.getGender() != null) donor.setGender(req.getGender());
        if (req.getBloodGroupCode() != null) donor.setBloodGroupCode(req.getBloodGroupCode());
        if (req.getDonorTypeCode() != null) donor.setDonorTypeCode(req.getDonorTypeCode());
        if (req.getAddress() != null) donor.setAddress(req.getAddress());
        if (req.getAadhaarNumber() != null) donor.setAadhaarNumber(req.getAadhaarNumber());
        if (req.getPatientId() != null) donor.setPatientId(req.getPatientId());
        if (req.getIsEligible() != null) donor.setIsEligible(req.getIsEligible());
        if (req.getNotes() != null) donor.setNotes(req.getNotes());
        return toDonorDto(donorRepo.save(donor));
    }

    private BloodBankDtos.DonorDto toDonorDto(BloodDonor d) {
        return BloodBankDtos.DonorDto.builder()
                .id(d.getId())
                .hospitalId(d.getHospital() != null ? d.getHospital().getId() : null)
                .donorCode(d.getDonorCode())
                .firstName(d.getFirstName())
                .lastName(d.getLastName())
                .phone(d.getPhone())
                .email(d.getEmail())
                .dob(d.getDob())
                .gender(d.getGender())
                .bloodGroupCode(d.getBloodGroupCode())
                .donorTypeCode(d.getDonorTypeCode())
                .address(d.getAddress())
                .aadhaarNumber(d.getAadhaarNumber())
                .patientId(d.getPatientId())
                .totalDonations(d.getTotalDonations())
                .lastDonationDate(d.getLastDonationDate())
                .isEligible(d.getIsEligible())
                .notes(d.getNotes())
                .createdAt(d.getCreatedAt())
                .updatedAt(d.getUpdatedAt())
                .build();
    }

    // ───── Units (inventory) ──────────────────────────────────────────

    public List<BloodBankDtos.UnitDto> listUnits(UUID hospitalId, String groupCode,
                                                 String componentCode, String statusCode) {
        LocalDate warnBefore = LocalDate.now().plusDays(EXPIRY_WARN_DAYS);
        return unitRepo.filter(hospitalId,
                        blank(groupCode), blank(componentCode), blank(statusCode))
                .stream()
                .map(u -> toUnitDto(u, warnBefore))
                .toList();
    }

    public BloodBankDtos.UnitDto getUnit(UUID id, UUID hospitalId) {
        BloodUnit unit = unitRepo.findById(id)
                .filter(u -> u.getHospital().getId().equals(hospitalId))
                .orElseThrow(() -> new ResourceNotFoundException("Unit not found"));
        return toUnitDto(unit, LocalDate.now().plusDays(EXPIRY_WARN_DAYS));
    }

    /**
     * Next bag number for a hospital, formatted "BG-{year}-{0001}". Sequence
     * resets per calendar year. Lexical MAX over the zero-padded suffix
     * gives the numeric MAX, so a single MAX() query is enough to compute
     * the next slot. Final conflict-safety is enforced by the unique
     * (hospital, bag_number) check on insert.
     */
    public String generateNextBagNumber(UUID hospitalId) {
        String prefix = "BG-" + LocalDate.now().getYear() + "-";
        String max = unitRepo.findMaxBagNumberWithPrefix(hospitalId, prefix);
        int next = 1;
        if (max != null && max.length() > prefix.length()) {
            try {
                next = Integer.parseInt(max.substring(prefix.length())) + 1;
            } catch (NumberFormatException ignored) {
                // legacy non-numeric suffix — fall back to 1, uniqueness check will retry
            }
        }
        return prefix + String.format("%04d", next);
    }

    @Transactional
    public BloodBankDtos.UnitDto registerUnit(UUID hospitalId, BloodBankDtos.UnitRequest req) {
        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Hospital not found"));

        // Auto-generate when the caller omits the bag number — the modal no
        // longer accepts free-text entry, so this is the standard path.
        String bagNumber = req.getBagNumber();
        if (bagNumber == null || bagNumber.isBlank()) {
            bagNumber = generateNextBagNumber(hospitalId);
        }
        final String finalBagNumber = bagNumber;
        unitRepo.findByHospital_IdAndBagNumber(hospitalId, finalBagNumber)
                .ifPresent(b -> { throw new ResponseStatusException(HttpStatus.CONFLICT, "Bag number already exists"); });

        BloodDonor donor = req.getDonorId() != null
                ? donorRepo.findById(req.getDonorId()).orElse(null)
                : null;
        if (donor != null && !Boolean.TRUE.equals(donor.getIsEligible())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Donor " + donor.getDonorCode() + " is deferred and cannot supply new units");
        }

        LocalDate collection = req.getCollectionDate() != null ? req.getCollectionDate() : LocalDate.now();
        LocalDate expiry = req.getExpiryDate();
        if (expiry == null) {
            int shelfLife = resolveShelfLifeDays(hospitalId, req.getComponentCode());
            expiry = collection.plusDays(shelfLife);
        }

        BloodUnit unit = BloodUnit.builder()
                .hospital(hospital)
                .bagNumber(finalBagNumber)
                .bloodGroupCode(req.getBloodGroupCode())
                .componentCode(req.getComponentCode())
                .statusCode(Boolean.TRUE.equals(req.getScreeningPassed()) ? "AVAILABLE" : "QUARANTINE")
                .sourceCode(req.getSourceCode() != null ? req.getSourceCode() : "IN_HOUSE_DONOR")
                .donor(donor)
                .volumeMl(req.getVolumeMl())
                .collectionDate(collection)
                .expiryDate(expiry)
                .storageLocation(req.getStorageLocation())
                .screeningPassed(Boolean.TRUE.equals(req.getScreeningPassed()))
                .costPrice(req.getCostPrice())
                .salePrice(req.getSalePrice())
                .notes(req.getNotes())
                .build();

        BloodUnit saved;
        try {
            saved = unitRepo.saveAndFlush(unit);
        } catch (DataIntegrityViolationException e) {
            // Two concurrent registrations raced past the pre-check above —
            // the unique (hospital, bag_number) constraint is the final guard.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bag number " + finalBagNumber + " was just taken by another registration — please retry");
        }
        if (donor != null) {
            donor.setTotalDonations((donor.getTotalDonations() == null ? 0 : donor.getTotalDonations()) + 1);
            donor.setLastDonationDate(collection);
            donorRepo.save(donor);
        }
        return toUnitDto(saved, LocalDate.now().plusDays(EXPIRY_WARN_DAYS));
    }

    /**
     * Records one replacement donation against an issued bag's pledge.
     * Bumps replacementsReceived by 1, capped at replacementsPledged.
     */
    @Transactional
    public BloodBankDtos.UnitDto recordReplacement(UUID id, UUID hospitalId) {
        BloodUnit unit = unitRepo.findById(id)
                .filter(u -> u.getHospital().getId().equals(hospitalId))
                .orElseThrow(() -> new ResourceNotFoundException("Unit not found"));
        int pledged = unit.getReplacementsPledged() == null ? 0 : unit.getReplacementsPledged();
        int received = unit.getReplacementsReceived() == null ? 0 : unit.getReplacementsReceived();
        if (received >= pledged) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "All " + pledged + " pledged replacement(s) already recorded for this bag");
        }
        unit.setReplacementsReceived(received + 1);
        return toUnitDto(unitRepo.save(unit), LocalDate.now().plusDays(EXPIRY_WARN_DAYS));
    }

    @Transactional
    public BloodBankDtos.UnitDto updateUnitStatus(UUID id, UUID hospitalId, String newStatusCode) {
        BloodUnit unit = unitRepo.findById(id)
                .filter(u -> u.getHospital().getId().equals(hospitalId))
                .orElseThrow(() -> new ResourceNotFoundException("Unit not found"));
        Set<String> allowed = ALLOWED_STATUS_TRANSITIONS.getOrDefault(unit.getStatusCode(), Set.of());
        if (!allowed.contains(newStatusCode)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot move bag from " + unit.getStatusCode() + " to " + newStatusCode);
        }
        unit.setStatusCode(newStatusCode);
        if ("AVAILABLE".equals(newStatusCode)) {
            unit.setScreeningPassed(true);
        }
        return toUnitDto(unitRepo.save(unit), LocalDate.now().plusDays(EXPIRY_WARN_DAYS));
    }

    /**
     * Atomic issuance + billing. Bag flips to ISSUED, audit fields set,
     * an InvoiceItem with item_type="BLOOD_BANK" is appended to the
     * patient's active admission invoice (or a fresh standalone OPD
     * invoice is created). The link is recorded back on the bag so a
     * future cancel can find the line item.
     */
    @Transactional
    public BloodBankDtos.UnitDto issueUnit(UUID unitId, UUID hospitalId, BloodBankDtos.IssueUnitRequest req, UUID issuedByUserId) {
        BloodUnit unit = unitRepo.findById(unitId)
                .filter(u -> u.getHospital().getId().equals(hospitalId))
                .orElseThrow(() -> new ResourceNotFoundException("Unit not found"));

        // Idempotent retry: if the bag is already ISSUED to this very patient,
        // a repeat call is a caller (notably OTM) re-sending after a lost
        // response — the issue and its invoice line already happened. Return
        // the current state as success so the caller can record its side and
        // converge, instead of a 409 that leaves the usage unrecordable.
        // A bag issued to a DIFFERENT patient still conflicts below.
        if ("ISSUED".equals(unit.getStatusCode())
                && unit.getIssuedToPatient() != null
                && java.util.Objects.equals(unit.getIssuedToPatient().getId(), req.getPatientId())) {
            return toUnitDto(unit, LocalDate.now().plusDays(EXPIRY_WARN_DAYS));
        }

        if (!"AVAILABLE".equals(unit.getStatusCode()) && !"RESERVED".equals(unit.getStatusCode())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Only AVAILABLE or RESERVED units can be issued; this bag is " + unit.getStatusCode());
        }
        if (unit.getExpiryDate() != null && unit.getExpiryDate().isBefore(LocalDate.now())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot issue an expired bag — mark it EXPIRED first");
        }
        if (req.getPatientId() == null) {
            // Surfaces a clean 400 to callers (notably OTM) instead of a 500
            // when an OT booking has no linked hmsPatientId. OTM Claude
            // flagged this as a callsite worth guarding clearly.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "patientId is required for issuance");
        }

        Patient patient = patientRepository.findById(req.getPatientId())
                .orElseThrow(() -> new ResourceNotFoundException("Patient not found"));

        String patientGroupCode = normalizeBloodGroupCode(patient.getBloodGroup());
        boolean incompatible = patientGroupCode != null && unit.getBloodGroupCode() != null
                && !isCompatible(unit.getBloodGroupCode(), unit.getComponentCode(), patientGroupCode);
        if (incompatible) {
            if (!Boolean.TRUE.equals(req.getOverrideIncompatibility())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Blood group mismatch: bag is " + bloodGroupLabel(unit.getBloodGroupCode())
                                + " (" + unit.getComponentCode() + ") but the patient's recorded group is "
                                + bloodGroupLabel(patientGroupCode)
                                + ". Confirm override with a reason to proceed.");
            }
            if (req.getIncompatibilityOverrideReason() == null || req.getIncompatibilityOverrideReason().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "A reason is required to override the blood-group mismatch");
            }
        }

        Admission admission = req.getAdmissionId() != null
                ? admissionRepository.findById(req.getAdmissionId()).orElse(null)
                : admissionRepository.findByPatientIdAndStatus(patient.getId(), AdmissionStatus.ADMITTED)
                        .orElse(null);

        User issuer = issuedByUserId != null
                ? userRepository.findById(issuedByUserId).orElse(null)
                : null;

        BigDecimal salePrice = req.getSalePrice() != null
                ? req.getSalePrice()
                : (unit.getSalePrice() != null ? unit.getSalePrice() : BigDecimal.ZERO);

        // Auto-bill — IPD path appends to admission invoice; OPD path
        // creates a standalone. Either way we capture the InvoiceItem
        // id on the bag for downstream reversal.
        Invoice invoice;
        if (admission != null) {
            invoice = invoiceRepository.findAllByAdmission_IdOrderByCreatedAtDesc(admission.getId())
                    .stream().findFirst()
                    .orElseGet(() -> createBlankAdmissionInvoice(unit.getHospital(), patient, admission));
            if (invoice.getItems() == null) invoice.setItems(new ArrayList<>());
            InvoiceItem line = InvoiceItem.builder()
                    .invoice(invoice)
                    .itemType("BLOOD_BANK")
                    .description(buildItemDescription(unit))
                    .quantity(1)
                    .unitPrice(salePrice)
                    .totalPrice(salePrice)
                    .build();
            invoice.getItems().add(line);
            recomputeInvoiceTotal(invoice);
            if (InvoiceStatus.PAID.equals(invoice.getStatus()) || InvoiceStatus.SETTLED.equals(invoice.getStatus())) {
                invoice.setStatus(InvoiceStatus.UNSETTLED);
            }
            invoice.setUpdatedAt(LocalDateTime.now());
            Invoice saved = invoiceRepository.save(invoice);
            unit.setInvoiceItemId(saved.getItems().stream()
                    .filter(it -> it == line || (it.getId() != null && it.getId().equals(line.getId())))
                    .findFirst().map(InvoiceItem::getId).orElse(null));
        } else {
            String invoiceNum = HospitalIdPrefix.of(unit.getHospital())
                    + "BLD-" + unitId.toString().replace("-", "").substring(0, 12).toUpperCase();
            InvoiceItem line = InvoiceItem.builder()
                    .itemType("BLOOD_BANK")
                    .description(buildItemDescription(unit))
                    .quantity(1)
                    .unitPrice(salePrice)
                    .totalPrice(salePrice)
                    .build();
            Invoice fresh = Invoice.builder()
                    .invoiceNumber(invoiceNum)
                    .hospital(unit.getHospital())
                    .patient(patient)
                    .subtotal(salePrice)
                    .tax(BigDecimal.ZERO)
                    .discount(BigDecimal.ZERO)
                    .total(salePrice)
                    .status(InvoiceStatus.UNPAID)
                    .notes("Blood bag " + unit.getBagNumber())
                    .build();
            line.setInvoice(fresh);
            fresh.setItems(new ArrayList<>(List.of(line)));
            Invoice saved = invoiceRepository.save(fresh);
            unit.setInvoiceItemId(saved.getItems().get(0).getId());
        }

        unit.setStatusCode("ISSUED");
        unit.setIssuedToPatient(patient);
        unit.setIssuedToAdmission(admission);
        unit.setIssuedByUser(issuer);
        unit.setIssuedAt(LocalDateTime.now());
        unit.setIssuedDoctorName(req.getDoctorName());
        unit.setReplacementsPledged(req.getReplacementsPledged() != null ? req.getReplacementsPledged() : 0);
        if (req.getNotes() != null && !req.getNotes().isBlank()) {
            unit.setNotes(unit.getNotes() == null ? req.getNotes() : (unit.getNotes() + "\n" + req.getNotes()));
        }
        if (incompatible) {
            String overrideNote = "[Blood group override] Bag " + bloodGroupLabel(unit.getBloodGroupCode())
                    + " issued to " + bloodGroupLabel(patientGroupCode) + " patient — "
                    + req.getIncompatibilityOverrideReason();
            unit.setNotes(unit.getNotes() == null ? overrideNote : (unit.getNotes() + "\n" + overrideNote));
        }
        if (req.getSalePrice() != null) unit.setSalePrice(req.getSalePrice());

        return toUnitDto(unitRepo.save(unit), LocalDate.now().plusDays(EXPIRY_WARN_DAYS));
    }

    private Invoice createBlankAdmissionInvoice(Hospital hospital, Patient patient, Admission admission) {
        String invoiceNum = HospitalIdPrefix.of(hospital)
                + "IPD-" + admission.getId().toString().replace("-", "").substring(0, 12).toUpperCase();
        Invoice invoice = Invoice.builder()
                .invoiceNumber(invoiceNum)
                .hospital(hospital)
                .patient(patient)
                .admission(admission)
                .subtotal(BigDecimal.ZERO)
                .tax(BigDecimal.ZERO)
                .discount(BigDecimal.ZERO)
                .total(BigDecimal.ZERO)
                .status(InvoiceStatus.UNPAID)
                .notes("Auto-created on blood-bank issuance")
                .build();
        invoice.setItems(new ArrayList<>());
        return invoiceRepository.save(invoice);
    }

    private void recomputeInvoiceTotal(Invoice invoice) {
        BigDecimal subtotal = invoice.getItems() == null ? BigDecimal.ZERO
                : invoice.getItems().stream()
                        .map(it -> it.getTotalPrice() != null ? it.getTotalPrice() : BigDecimal.ZERO)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal tax = invoice.getTax() != null ? invoice.getTax() : BigDecimal.ZERO;
        BigDecimal discount = invoice.getDiscount() != null ? invoice.getDiscount() : BigDecimal.ZERO;
        invoice.setSubtotal(subtotal);
        invoice.setTotal(subtotal.add(tax).subtract(discount));
    }

    private String buildItemDescription(BloodUnit unit) {
        return "Blood Bag " + unit.getBagNumber()
                + " · " + unit.getBloodGroupCode()
                + " · " + unit.getComponentCode();
    }

    /** Converts a Patient.bloodGroup value ("A+", "O-", ...) to a lookup code ("A_POS", "O_NEG", ...), or null if unrecognized. */
    private static String normalizeBloodGroupCode(String patientBloodGroup) {
        if (patientBloodGroup == null) return null;
        return switch (patientBloodGroup.trim().toUpperCase()) {
            case "A+" -> "A_POS";
            case "A-" -> "A_NEG";
            case "B+" -> "B_POS";
            case "B-" -> "B_NEG";
            case "AB+" -> "AB_POS";
            case "AB-" -> "AB_NEG";
            case "O+" -> "O_POS";
            case "O-" -> "O_NEG";
            default -> null;
        };
    }

    /** Renders a lookup code ("A_POS") back to its short label ("A+") for messages/audit notes. */
    private static String bloodGroupLabel(String code) {
        if (code == null) return "Unknown";
        return switch (code) {
            case "A_POS" -> "A+";
            case "A_NEG" -> "A-";
            case "B_POS" -> "B+";
            case "B_NEG" -> "B-";
            case "AB_POS" -> "AB+";
            case "AB_NEG" -> "AB-";
            case "O_POS" -> "O+";
            case "O_NEG" -> "O-";
            default -> code;
        };
    }

    /**
     * True if a bag of {@code bagGroupCode}/{@code componentCode} is safe to
     * transfuse into a recipient with {@code patientGroupCode}. RBC-bearing
     * components follow standard donor-antigen rules; plasma-bearing
     * components follow the reversed, ABO-only (Rh-irrelevant) rule.
     */
    private static boolean isCompatible(String bagGroupCode, String componentCode, String patientGroupCode) {
        if (RBC_COMPONENTS.contains(componentCode)) {
            Set<String> donors = RBC_COMPATIBLE_DONORS.get(patientGroupCode);
            return donors == null || donors.contains(bagGroupCode);
        }
        String patientAbo = patientGroupCode.split("_")[0];
        String bagAbo = bagGroupCode.split("_")[0];
        Set<String> donors = PLASMA_COMPATIBLE_DONOR_ABO.get(patientAbo);
        return donors == null || donors.contains(bagAbo);
    }

    // ───── Stats ──────────────────────────────────────────────────────

    public BloodBankDtos.StatsDto getStats(UUID hospitalId) {
        LocalDate warnBefore = LocalDate.now().plusDays(EXPIRY_WARN_DAYS);
        long total = unitRepo.countByHospital_Id(hospitalId);
        long available = unitRepo.countByStatus(hospitalId, "AVAILABLE");
        long quarantine = unitRepo.countByStatus(hospitalId, "QUARANTINE");
        long reserved = unitRepo.countByStatus(hospitalId, "RESERVED");
        long issued = unitRepo.countByStatus(hospitalId, "ISSUED");
        long expiring = unitRepo.countExpiringSoon(hospitalId, warnBefore);
        long totalDonors = donorRepo.countByHospital_Id(hospitalId);

        Map<String, Map<String, Long>> matrix = new LinkedHashMap<>();
        for (Object[] row : unitRepo.stockMatrix(hospitalId)) {
            String group = (String) row[0];
            String component = (String) row[1];
            long count = ((Number) row[2]).longValue();
            matrix.computeIfAbsent(group, g -> new LinkedHashMap<>()).put(component, count);
        }

        List<BloodBankDtos.UnitDto> expiringSoon = unitRepo.findExpiringSoon(hospitalId, warnBefore)
                .stream().limit(10).map(u -> toUnitDto(u, warnBefore)).toList();

        return BloodBankDtos.StatsDto.builder()
                .totalUnits(total)
                .availableUnits(available)
                .quarantineUnits(quarantine)
                .reservedUnits(reserved)
                .issuedUnits(issued)
                .expiringSoonUnits(expiring)
                .totalDonors(totalDonors)
                .stockMatrix(matrix)
                .expiringSoon(expiringSoon)
                .build();
    }

    // ───── Helpers ────────────────────────────────────────────────────

    private int resolveShelfLifeDays(UUID hospitalId, String componentCode) {
        return lookupRepo.resolve(hospitalId, "COMPONENT", componentCode)
                .map(l -> {
                    if (l.getMetadata() == null || l.getMetadata().isBlank()) return 35;
                    try {
                        JsonNode node = JSON.readTree(l.getMetadata());
                        JsonNode shelf = node.get("shelfLifeDays");
                        return shelf != null && shelf.isInt() ? shelf.asInt() : 35;
                    } catch (Exception e) {
                        log.warn("Could not parse component metadata for {}: {}", componentCode, e.getMessage());
                        return 35;
                    }
                })
                .orElse(35);
    }

    private String blank(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private BloodBankDtos.UnitDto toUnitDto(BloodUnit u, LocalDate warnBefore) {
        BloodDonor d = u.getDonor();
        String donorName = d != null
                ? d.getFirstName() + (d.getLastName() != null ? " " + d.getLastName() : "")
                : null;
        Patient p = u.getIssuedToPatient();
        String patientName = p != null
                ? p.getFirstName() + (p.getLastName() != null ? " " + p.getLastName() : "")
                : null;
        Admission a = u.getIssuedToAdmission();
        User issuer = u.getIssuedByUser();
        String issuerName = issuer != null
                ? issuer.getFirstName() + (issuer.getLastName() != null ? " " + issuer.getLastName() : "")
                : null;

        boolean soon = u.getExpiryDate() != null
                && !u.getExpiryDate().isAfter(warnBefore)
                && !"ISSUED".equals(u.getStatusCode())
                && !"EXPIRED".equals(u.getStatusCode())
                && !"DISCARDED".equals(u.getStatusCode());

        return BloodBankDtos.UnitDto.builder()
                .id(u.getId())
                .hospitalId(u.getHospital() != null ? u.getHospital().getId() : null)
                .bagNumber(u.getBagNumber())
                .bloodGroupCode(u.getBloodGroupCode())
                .componentCode(u.getComponentCode())
                .statusCode(u.getStatusCode())
                .sourceCode(u.getSourceCode())
                .donorId(d != null ? d.getId() : null)
                .donorName(donorName)
                .donorPhone(d != null ? d.getPhone() : null)
                .volumeMl(u.getVolumeMl())
                .collectionDate(u.getCollectionDate())
                .expiryDate(u.getExpiryDate())
                .storageLocation(u.getStorageLocation())
                .screeningPassed(u.getScreeningPassed())
                .costPrice(u.getCostPrice())
                .salePrice(u.getSalePrice())
                .issuedToPatientId(p != null ? p.getId() : null)
                .issuedToPatientName(patientName)
                .issuedToAdmissionId(a != null ? a.getId() : null)
                .issuedToAdmissionNumber(a != null ? a.getAdmissionNumber() : null)
                .issuedByUserId(issuer != null ? issuer.getId() : null)
                .issuedByUserName(issuerName)
                .issuedAt(u.getIssuedAt())
                .issuedDoctorName(u.getIssuedDoctorName())
                .replacementsPledged(u.getReplacementsPledged())
                .replacementsReceived(u.getReplacementsReceived())
                .invoiceItemId(u.getInvoiceItemId())
                .notes(u.getNotes())
                .createdAt(u.getCreatedAt())
                .expiringSoon(soon)
                .build();
    }
}
