# Stage 1: Build the application
FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /app

# Copy the pom.xml and source code
COPY pom.xml .
COPY src ./src

# Build the application
RUN mvn clean package -DskipTests

# Stage 2: Run the application
FROM eclipse-temurin:21-jre
WORKDIR /app

# All hospitals on this deployment run in India. Pin the JVM (and OS) timezone
# to Asia/Kolkata so every LocalDateTime.now() / LocalDate.now() in service
# code returns IST, regardless of what the base image or host platform
# defaults to. Without this, on a UTC container the admission_date written at
# 11:30 PM IST would be stored as 18:00 UTC — and any code that interprets
# that string as local time would silently mis-display the timestamp.
ENV TZ=Asia/Kolkata

# Copy the built jar from the build stage
COPY --from=build /app/target/clinics-backend-0.0.1-SNAPSHOT.jar app.jar

# Expose the port (Render uses PORT env var, but EXPOSE is good for documentation)
EXPOSE 9003

# Run the application, ensuring it listens on the PORT provided by the environment.
# -Duser.timezone duplicates the ENV TZ so even if the container's /etc/localtime
# is missing the IANA db (slim JRE images sometimes are), the JVM still picks IST.
ENTRYPOINT ["java", "-Xmx220m", "-XX:MaxMetaspaceSize=128m", "-XX:ReservedCodeCacheSize=64m", "-XX:+UseContainerSupport", "-Duser.timezone=Asia/Kolkata", "-Dserver.port=${PORT:9003}", "-jar", "app.jar"]
