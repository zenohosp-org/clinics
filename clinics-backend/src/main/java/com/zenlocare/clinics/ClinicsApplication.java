package com.zenlocare.clinics;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ClinicsApplication {

	public static void main(String[] args) {
		SpringApplication.run(ClinicsApplication.class, args);
	}

}
