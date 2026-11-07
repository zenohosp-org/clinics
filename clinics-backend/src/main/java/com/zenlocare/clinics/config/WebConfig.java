package com.zenlocare.clinics.config;

import com.fasterxml.jackson.datatype.hibernate6.Hibernate6Module;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import com.zenlocare.clinics.security.TenantScopeInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final TenantScopeInterceptor tenantScope;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(tenantScope).addPathPatterns("/api/**");
    }

    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

    @Bean
    public Hibernate6Module hibernate6Module() {
        Hibernate6Module module = new Hibernate6Module();
        module.disable(Hibernate6Module.Feature.USE_TRANSIENT_ANNOTATION);
        return module;
    }
}
