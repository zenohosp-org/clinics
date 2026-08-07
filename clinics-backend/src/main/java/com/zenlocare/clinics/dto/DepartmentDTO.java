package com.zenlocare.clinics.dto;

import com.zenlocare.clinics.entity.DepartmentType;
import lombok.Builder;
import lombok.Data;
import java.util.UUID;

@Data @Builder
public class DepartmentDTO {
    private UUID id;
    private String name;
    private DepartmentType type;
    private String code;
    private String description;
    private Boolean isActive;
}
