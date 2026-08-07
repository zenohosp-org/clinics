package com.zenlocare.clinics.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.oauth2.client.web.HttpSessionOAuth2AuthorizationRequestRepository;

import java.io.IOException;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final GoogleOAuth2SuccessHandler googleOAuth2SuccessHandler;
    private final DirectorySsoSuccessHandler directorySsoSuccessHandler;
    private final CustomOAuth2UserService customOAuth2UserService;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(csrf -> csrf.disable())
                // Explicitly allow sessions for the OAuth2 handshake, but stay stateless for APIs
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                .securityContext(context -> context.securityContextRepository(new HttpSessionSecurityContextRepository()))
                .authorizeHttpRequests(auth -> auth
                        // Public endpoints — no token required
                        .requestMatchers(
                                "/api/auth/**",
                                "/api/public/**",
                                "/actuator/health",
                                "/login/**",
                                "/oauth2/**",
                                "/error")
                        .permitAll()
                        // Super Admin only
                        .requestMatchers("/api/super-admin/**").hasRole("super_admin")
                        // Hospital Admin and above (role names match Directory: lowercase with underscores)
                        .requestMatchers("/api/admin/**").hasAnyRole("hospital_admin", "super_admin")
                        // All authenticated users
                        .anyRequest().authenticated())
                .oauth2Login(oauth2 -> oauth2
                        // Suppress Spring's DefaultLoginPageGeneratingFilter, which
                        // otherwise serves a built-in HTML form whenever anonymous
                        // traffic hits a protected route or an OAuth2 attempt fails.
                        // Both flows now bounce back to the SPA login at /login,
                        // with a query-string error code the frontend maps to a
                        // friendly message.
                        .loginPage(frontendUrl + "/login")
                        .failureUrl(frontendUrl + "/login?error=sso_failed")
                        .authorizationEndpoint(auth -> auth.authorizationRequestRepository(new HttpSessionOAuth2AuthorizationRequestRepository()))
                        .userInfoEndpoint(userInfo -> userInfo.userService(customOAuth2UserService))
                        .successHandler(delegatingOAuth2SuccessHandler()))
                // API requests get a clean 401 when unauthenticated instead of
                // the default OAuth2 entry point (302 redirect to loginPage).
                // Browser routes keep the redirect so a direct URL-navigated
                // anonymous user still lands on the SPA's /login screen.
                // Without this, the frontend's axios call would silently
                // follow the 302, get back the HTML login page, then crash
                // when array-shaped APIs returned a string body to consumers
                // like doctors.filter(...).
                .exceptionHandling(ex -> ex
                        .defaultAuthenticationEntryPointFor(
                                new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED),
                                new AntPathRequestMatcher("/api/**")))
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Routes OAuth2 login success to the correct handler based on the registration ID.
     * - "google"    → GoogleOAuth2SuccessHandler
     * - "directory" → DirectorySsoSuccessHandler
     */
    private AuthenticationSuccessHandler delegatingOAuth2SuccessHandler() {
        return (HttpServletRequest request, HttpServletResponse response, Authentication authentication) -> {
            if (authentication instanceof OAuth2AuthenticationToken token) {
                String registrationId = token.getAuthorizedClientRegistrationId();
                AuthenticationSuccessHandler handler = switch (registrationId) {
                    case "directory" -> directorySsoSuccessHandler;
                    default -> googleOAuth2SuccessHandler; // "google" and any future providers
                };
                handler.onAuthenticationSuccess(request, response, authentication);
            } else {
                googleOAuth2SuccessHandler.onAuthenticationSuccess(request, response, authentication);
            }
        };
    }

    @org.springframework.beans.factory.annotation.Value("${frontend.url}")
    private String frontendUrl;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        // Use allowedOriginPatterns to support wildcards and credentials together
        config.setAllowedOriginPatterns(List.of(
                "http://localhost:3000",
                "http://localhost:5173",
                "http://localhost:5174",
                "http://localhost:5175",
                "http://localhost:5177",
                "https://*.onrender.com",
                "https://*.vercel.app",
                "https://ot.zenohosp.com",
                "https://pharmacy.zenohosp.com",
                "https://api-pharmacy.zenohosp.com",
                "https://inventory.zenohosp.com",
                "https://api-inventory.zenohosp.com",
                "https://finance.zenohosp.com",
                "https://api-finance.zenohosp.com",
                "https://labs.zenohosp.com",
                "https://api-labs.zenohosp.com",
                "https://asset.zenohosp.com",
                "https://api-asset.zenohosp.com",
                "https://hms.zenohosp.com",
                "https://api-hms.zenohosp.com",
                "https://clinics.zenohosp.com",
                "https://api-clinics.zenohosp.com",
                frontendUrl));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
