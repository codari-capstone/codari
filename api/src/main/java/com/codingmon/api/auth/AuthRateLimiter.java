package com.codingmon.api.auth;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.stereotype.Component;

// IP별 발송·가입 여부 조회 제한(하루 20회)과 로그인 연속 실패 잠금(같은 이메일 5회 실패 시 5분).
// ponytail: DB 문서대로 서버 메모리에서 센다. 재시작하면 초기화되고 서버가 한 대일 때만 정확하다. 서버를 늘리면 공유 저장소로 옮긴다.
@Component
class AuthRateLimiter {

    static final int IP_DAILY_LIMIT = 20;
    static final int LOGIN_MAX_FAILURES = 5;
    static final Duration LOGIN_LOCK = Duration.ofMinutes(5);

    private record LoginFailures(int count, Instant lockedUntil) {
    }

    private volatile LocalDate day = today();
    private final Map<String, AtomicInteger> ipCounts = new ConcurrentHashMap<>();
    private final Map<String, LoginFailures> loginFailures = new ConcurrentHashMap<>();

    // 가입과 재설정은 따로 센다. 하루는 UTC 날짜 기준이다.
    boolean tryIp(EmailCode.Purpose purpose, String ip) {
        startNewDayIfNeeded();
        return ipCounts.computeIfAbsent(purpose + ":" + ip, key -> new AtomicInteger()).incrementAndGet() <= IP_DAILY_LIMIT;
    }

    boolean isLoginLocked(String email, Instant now) {
        LoginFailures failures = loginFailures.get(key(email));
        return failures != null && failures.lockedUntil() != null && now.isBefore(failures.lockedUntil());
    }

    void recordLoginFailure(String email, Instant now) {
        startNewDayIfNeeded();
        loginFailures.compute(key(email), (key, current) -> {
            // 동시에 들어와 잠금 검사를 먼저 통과한 요청이 걸려 있는 잠금을 지우지 않게 한다.
            if (current != null && current.lockedUntil() != null && now.isBefore(current.lockedUntil())) {
                return current;
            }
            // 잠금이 풀렸으면 처음부터 다시 센다.
            int count = current == null || current.lockedUntil() != null ? 1 : current.count() + 1;
            return count >= LOGIN_MAX_FAILURES ? new LoginFailures(count, now.plus(LOGIN_LOCK)) : new LoginFailures(count, null);
        });
    }

    void resetLoginFailures(String email) {
        loginFailures.remove(key(email));
    }

    // 날짜가 바뀌면 두 기록을 모두 비운다. 아무 이메일로나 실패를 쌓아도 메모리가 계속 늘지 않게 한다.
    // 그 순간 걸려 있던 로그인 잠금은 최대 5분 일찍 풀린다.
    private void startNewDayIfNeeded() {
        LocalDate today = today();
        if (!today.equals(day)) {
            ipCounts.clear();
            loginFailures.clear();
            day = today;
        }
    }

    private static String key(String email) {
        return email.toLowerCase();
    }

    private static LocalDate today() {
        return LocalDate.now(ZoneOffset.UTC);
    }
}
