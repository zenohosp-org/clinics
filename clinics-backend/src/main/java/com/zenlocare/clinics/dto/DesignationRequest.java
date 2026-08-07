package com.zenlocare.clinics.dto;

import com.zenlocare.clinics.entity.DesignationCategory;
import lombok.Data;
import java.util.UUID;

@Data
public class DesignationRequest {
    private UUID hospitalId;
    private UUID departmentId;
    private String name;
    private DesignationCategory category;
}
