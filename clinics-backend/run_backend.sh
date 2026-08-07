#!/bin/bash
# ZenoHosp Clinics — Backend (macOS)

export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"

cd "$(dirname "$0")"

# Kill anything already on port 9003
if lsof -ti:9003 > /dev/null 2>&1; then
  echo " Killing existing process on port 9003..."
  lsof -ti:9003 | xargs kill -9 2>/dev/null
  sleep 1
fi

echo ""
echo " ZenoHosp Clinics Backend"
echo " Spring Boot 3 / Java 21"
echo " http://localhost:9003"
echo " Press Ctrl+C to stop."
echo ""

./mvnw spring-boot:run -Dspring-boot.run.profiles=local -Dspring-boot.run.jvmArguments="-Xmx2g"

