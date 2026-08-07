# JWT Authentication + Cookie Storage Guide
## (Spring Boot + Spring Security)

---

## How It Works — Big Picture

```
1. User sends email + password  →  POST /api/auth/login
2. Backend validates credentials →  Generates JWT token
3. JWT stored as HTTP-only Cookie → Browser sends it on every request
4. JwtFilter reads cookie         → Sets authenticated user in Spring Security
5. Logout                         → Cookie is cleared (maxAge = 0)
```

---

## Files to Create

```
src/main/java/com/yourpackage/
├── dto/
│   ├── LoginRequest.java
│   ├── LoginResponse.java
│   └── ApiResponse.java
├── security/
│   ├── JwtUtil.java        ← generates & reads tokens
│   └── JwtFilter.java      ← runs on every request
├── config/
│   └── SecurityConfig.java ← route protection + CORS
├── service/
│   └── AuthService.java    ← login logic
└── controller/
    └── AuthController.java ← /api/auth/login & /logout
```

---

## Step 1 — DTOs

### `LoginRequest.java`
```java
@Data
public class LoginRequest {
    private String email;
    private String password;
}
```

### `LoginResponse.java`
```java
@Data @Builder
public class LoginResponse {
    private Integer userId;
    private String email;
    private String displayName;
    private String role;
    private Integer hospitalId;
    private String hospitalName;
}
```

### `ApiResponse.java`
```java
@Data @AllArgsConstructor
public class ApiResponse<T> {
    private boolean success;
    private String message;
    private T data;

    public static <T> ApiResponse<T> ok(String message, T data) {
        return new ApiResponse<>(true, message, data);
    }

    public static <T> ApiResponse<T> error(String message) {
        return new ApiResponse<>(false, message, null);
    }
}
```

---

## Step 2 — `JwtUtil.java`
Generates and reads JWT tokens.

```java
@Component
public class JwtUtil {

    private final SecretKey key;
    private final long expirationMs;

    public JwtUtil(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.expiration}") long expirationSeconds) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationSeconds * 1000;
    }

    public String generateToken(Integer userId, Integer hospitalId, String role, String email) {
        Date now = new Date();
        JwtBuilder builder = Jwts.builder()
                .subject(userId.toString())
                .claim("role", role)
                .claim("email", email)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expirationMs))
                .signWith(key);

        if (hospitalId != null)
            builder.claim("hospitalId", hospitalId.toString());

        return builder.compact();
    }

    public Claims parseToken(String token) {
        return Jwts.parser().verifyWith(key).build()
                .parseSignedClaims(token).getPayload();
    }

    public Integer getUserId(String token) {
        return Integer.parseInt(parseToken(token).getSubject());
    }

    public String getRole(String token) {
        return parseToken(token).get("role", String.class);
    }

    public Integer getHospitalId(String token) {
        String id = parseToken(token).get("hospitalId", String.class);
        return id != null ? Integer.parseInt(id) : null;
    }

    public String getEmail(String token) {
        return parseToken(token).get("email", String.class);
    }

    public boolean isValid(String token) {
        try { parseToken(token); return true; }
        catch (JwtException | IllegalArgumentException e) { return false; }
    }
}
```

---

## Step 3 — `JwtFilter.java`
Runs before every request. Reads the cookie and authenticates the user.

```java
@Component
@RequiredArgsConstructor
public class JwtFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;

    @Value("${jwt.cookie.name}")
    private String cookieName;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String token = extractTokenFromCookie(request);

        if (token != null && jwtUtil.isValid(token)) {
            String userId = jwtUtil.getUserId(token).toString();
            String role   = jwtUtil.getRole(token);

            // Spring Security needs "ROLE_" prefix
            var authorities = List.of(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()));
            var auth = new UsernamePasswordAuthenticationToken(userId, null, authorities);
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        filterChain.doFilter(request, response);
    }

    private String extractTokenFromCookie(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        for (Cookie cookie : request.getCookies())
            if (cookieName.equals(cookie.getName())) return cookie.getValue();
        return null;
    }
}
```

---

## Step 4 — `SecurityConfig.java`
Controls which routes are public and which require login.

```java
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtFilter jwtFilter;

    @Value("${cors.allowed.origins:http://localhost:5173,http://localhost:3000}")
    private String allowedOrigins;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(allowedOrigins.split(",")));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);  // Required for cookie to be sent cross-origin
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()             // Login/logout — no auth needed
                .requestMatchers("/api/admin/**").hasRole("SUPER_ADMIN") // Super admin only
                .requestMatchers("/api/**").authenticated()              // Everything else needs login
                .anyRequest().permitAll()
            )
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

---

## Step 5 — `AuthService.java`
Login business logic — validates credentials, builds JWT.

```java
@Service
@RequiredArgsConstructor
public class AuthService {

    private final StaffRepository staffRepository;
    private final JwtUtil jwtUtil;
    private final PasswordEncoder passwordEncoder;

    public LoginResult login(LoginRequest request) {

        // Find user
        Staff staff = staffRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new RuntimeException("Invalid email or password"));

        // Check password
        if (!passwordEncoder.matches(request.getPassword(), staff.getPasswordHash()))
            throw new RuntimeException("Invalid email or password");

        // Check account is active
        if (!"ACTIVE".equals(staff.getStatus()))
            throw new RuntimeException("Account is deactivated");

        // Update last login
        staff.setLastLogin(LocalDateTime.now());
        staffRepository.save(staff);

        // hospitalId is null for SUPER_ADMIN
        Integer hospitalId = staff.getHospital() != null ? staff.getHospital().getId() : null;

        String token = jwtUtil.generateToken(
                staff.getId(), hospitalId, staff.getRole(), staff.getEmail());

        LoginResponse response = LoginResponse.builder()
                .userId(staff.getId())
                .email(staff.getEmail())
                .displayName(staff.getDisplayName())
                .role(staff.getRole())
                .hospitalId(hospitalId)
                .hospitalName(hospitalId != null ? staff.getHospital().getHospitalName() : null)
                .build();

        return new LoginResult(token, response);
    }

    public record LoginResult(String token, LoginResponse response) {}
}
```

---

## Step 6 — `AuthController.java`
Exposes login and logout endpoints.

```java
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @Value("${jwt.cookie.name}")   private String cookieName;
    @Value("${jwt.expiration}")    private int cookieMaxAge;
    @Value("${jwt.cookie.secure}") private boolean cookieSecure;

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@RequestBody LoginRequest request,
            HttpServletResponse response) {

        AuthService.LoginResult result = authService.login(request);

        Cookie cookie = new Cookie(cookieName, result.token());
        cookie.setHttpOnly(true);       // JS cannot read it — XSS safe
        cookie.setSecure(cookieSecure); // Set true in production (HTTPS)
        cookie.setPath("/");
        cookie.setMaxAge(cookieMaxAge); // 86400 = 24 hours
        response.addCookie(cookie);

        return ApiResponse.ok("Login successful", result.response());
    }

    @PostMapping("/logout")
    public ApiResponse<Void> logout(HttpServletResponse response) {
        Cookie cookie = new Cookie(cookieName, "");
        cookie.setHttpOnly(true);
        cookie.setSecure(cookieSecure);
        cookie.setPath("/");
        cookie.setMaxAge(0); // Deletes the cookie
        response.addCookie(cookie);
        return ApiResponse.ok("Logged out", null);
    }
}
```

---

## How the JWT Cookie Works

```
POST /api/auth/login  →  Backend sets:  ZENOHMS_TOKEN=<jwt>  (HttpOnly, 24h)
Any API request       →  Browser sends cookie automatically  →  JwtFilter reads it
POST /api/auth/logout →  Backend sets:  ZENOHMS_TOKEN=""  maxAge=0  →  deleted
```

| Cookie property | Value | Reason |
|---|---|---|
| `HttpOnly=true` | JS cannot read it | XSS protection |
| `Secure=false` | Works on HTTP | Set `true` in production |
| `Path=/` | Sent for all routes | Needed for all API calls |
| `MaxAge=86400` | 24 hours | Auto-expires after 1 day |

---

## JWT Payload (what's inside the token)

```json
{
  "sub": "1",
  "role": "SUPER_ADMIN",
  "email": "admin@example.com",
  "hospitalId": null,
  "iat": 1709400000,
  "exp": 1709486400
}
```

- `hospitalId` is `null` for `SUPER_ADMIN`
- `hospitalId` has a value for `ADMIN`, `DOCTOR`, `STAFF`

---

## Test with Postman

```
POST http://localhost:8080/api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "admin123"
}
```

Expected response:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "userId": 1,
    "email": "admin@example.com",
    "displayName": "Admin",
    "role": "SUPER_ADMIN",
    "hospitalId": null,
    "hospitalName": null
  }
}
```

The JWT cookie is automatically stored in Postman's cookie jar after login. All subsequent requests will send it automatically.
