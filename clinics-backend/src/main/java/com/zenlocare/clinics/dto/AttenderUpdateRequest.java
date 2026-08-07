package com.zenlocare.clinics.dto;

import lombok.Data;

@Data
public class AttenderUpdateRequest {
    private String attenderName;
    private String attenderPhone;
    private String attenderRelationship;
}
