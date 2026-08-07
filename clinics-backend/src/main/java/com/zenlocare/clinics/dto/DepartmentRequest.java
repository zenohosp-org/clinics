package com.zenlocare.clinics.dto;

import com.zenlocare.clinics.entity.DepartmentType;
import lombok.Data;
import java.util.UUID;

@Data
public class DepartmentRequest {
    private UUID hospitalId;
    private String name;
    private DepartmentType type;
    private String code;
    private String description;
}
