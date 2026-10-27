# syntax=docker/dockerfile:1
# API 서버 이미지 (infra/compose.yaml).
# 빌드 단계는 빌드하는 기계의 아키텍처(BUILDPLATFORM)에서 돈다. jar는 아키텍처와 무관해서
# 맥(arm64)에서 amd64 서버용 이미지를 만들 때도 Gradle을 에뮬레이션으로 돌리지 않는다.
FROM --platform=$BUILDPLATFORM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY gradlew settings.gradle build.gradle ./
COPY gradle gradle
# 소스가 바뀌어도 의존성 층은 캐시를 쓴다
RUN ./gradlew --no-daemon -q dependencies > /dev/null
COPY src src
RUN ./gradlew --no-daemon -q bootJar && cp build/libs/*.jar app.jar

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 --no-create-home app
WORKDIR /app
COPY --from=build /src/app.jar app.jar
USER app
EXPOSE 8080
# ENTRYPOINT는 기반 이미지 것을 그대로 쓴다. USE_SYSTEM_CA_CERTS를 켜면 /certificates의 인증서를
# JVM truststore에 넣고 이 CMD를 실행한다(TLS를 검사하는 프록시 뒤에서 외부 HTTPS를 부를 때).
CMD ["java", "-jar", "/app/app.jar"]
