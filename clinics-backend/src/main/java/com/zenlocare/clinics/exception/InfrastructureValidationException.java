package com.zenlocare.clinics.exception;

import lombok.Getter;
import java.util.List;

@Getter
public class InfrastructureValidationException extends RuntimeException {
    private final boolean blocked;
    private final List<String> reasons;
    private final List<String> warnings;

    public InfrastructureValidationException(List<String> reasons, List<String> warnings) {
        super("Infrastructure removal blocked");
        this.blocked = !reasons.isEmpty();
        this.reasons = reasons;
        this.warnings = warnings;
    }
}
