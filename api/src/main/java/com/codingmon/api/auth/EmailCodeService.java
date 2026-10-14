package com.codingmon.api.auth;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HexFormat;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.ErrorResponseException;

// 기능명세 '계정 규칙'의 인증번호와 이메일별 발송 제한. IP 제한과 가입 여부 확인은 호출하는 쪽에서 먼저 한다.
@Service
class EmailCodeService {

    static final Duration CODE_TTL = Duration.ofMinutes(5);
    static final Duration RESEND_INTERVAL = Duration.ofMinutes(1);
    static final int EMAIL_DAILY_LIMIT = 5;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final EmailCodeRepository codes;
    private final EmailSender sender;
    private final SecretKeySpec hmacKey;

    // 6자리는 경우의 수가 적어 일반 해시는 바로 복원되므로 서버 비밀키로 HMAC한다. JWT 키를 함께 쓴다.
    EmailCodeService(EmailCodeRepository codes, EmailSender sender, @Value("${app.jwt.secret}") String base64Secret) {
        this.codes = codes;
        this.sender = sender;
        this.hmacKey = new SecretKeySpec(Base64.getDecoder().decode(base64Secret), "HmacSHA256");
    }

    @Transactional
    public void send(String email, EmailCode.Purpose purpose) {
        Instant now = Instant.now();
        boolean tooSoon = codes.findLastSentAt(email, purpose).filter(last -> last.isAfter(now.minus(RESEND_INTERVAL))).isPresent();
        Instant todayStart = LocalDate.now(ZoneOffset.UTC).atStartOfDay(ZoneOffset.UTC).toInstant();
        if (tooSoon || codes.countSentSince(email, purpose, todayStart) >= EMAIL_DAILY_LIMIT) {
            throw AuthErrors.tooManyRequests();
        }
        // 다시 보내면 이전 번호는 무효다.
        codes.invalidateActive(email, purpose, now);
        String code = "%06d".formatted(RANDOM.nextInt(1_000_000));
        try {
            codes.saveAndFlush(new EmailCode(email, purpose, hash(code), now.plus(CODE_TTL)));
        } catch (DataIntegrityViolationException e) {
            // 같은 이메일로 동시에 보내면 유효한 인증번호는 하나만 둘 수 있어 한쪽이 여기서 막힌다.
            throw AuthErrors.tooManyRequests();
        }
        sender.sendCode(email, purpose, code);
    }

    // 틀린 횟수는 실패 응답과 함께 남겨야 하므로 예외로 롤백하지 않는다.
    @Transactional(noRollbackFor = ErrorResponseException.class)
    public void verify(String email, EmailCode.Purpose purpose, String code) {
        Instant now = Instant.now();
        EmailCode active = codes.findActiveForUpdate(email, purpose)
                .filter(c -> !c.isExpired(now))
                .orElseThrow(() -> AuthErrors.error(HttpStatus.BAD_REQUEST, "CODE_EXPIRED",
                        "인증번호가 만료됐어요. 인증번호를 다시 받아 주세요"));
        byte[] expected = active.getTokenHash().getBytes(StandardCharsets.US_ASCII);
        byte[] actual = hash(code == null ? "" : code).getBytes(StandardCharsets.US_ASCII);
        if (!MessageDigest.isEqual(expected, actual)) {
            if (active.fail(now)) {
                throw AuthErrors.error(HttpStatus.BAD_REQUEST, "CODE_ATTEMPTS_EXCEEDED",
                        "입력 횟수를 초과했어요. 인증번호를 다시 받아 주세요");
            }
            throw AuthErrors.error(HttpStatus.BAD_REQUEST, "CODE_MISMATCH", "인증번호가 맞지 않아요");
        }
        active.use(now);
    }

    private String hash(String code) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(hmacKey);
            return HexFormat.of().formatHex(mac.doFinal(code.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
