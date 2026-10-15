package com.codingmon.api.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.ErrorResponseException;

import com.codingmon.api.user.UserRepository;

// 비밀번호 재설정(COM-08). 일반 가입 계정(password_hash가 있는 계정)만 대상이다.
@Service
class PasswordResetService {

    static final Duration RESET_TTL = Duration.ofMinutes(10);

    private static final String EMAIL_CLAIM = "email";
    private static final String TOKEN_VERSION_CLAIM = "tokenVersion";

    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final EmailCodeService codes;
    private final AuthRateLimiter limiter;
    private final AuthCertificates certificates;
    private final PasswordEncoder passwordEncoder;
    private final TransactionTemplate transactions;

    PasswordResetService(UserRepository users, RefreshTokenRepository refreshTokens, EmailCodeService codes,
            AuthRateLimiter limiter, AuthCertificates certificates, PasswordEncoder passwordEncoder,
            TransactionTemplate transactions) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.codes = codes;
        this.limiter = limiter;
        this.certificates = certificates;
        this.passwordEncoder = passwordEncoder;
        this.transactions = transactions;
    }

    // 가입되지 않은 이메일(GitHub 가입 계정 포함)이면 보내지 않고 알린다. 이 조회는 IP 기준에만 센다.
    void sendCode(String rawEmail, String ip) {
        String email = AccountRules.email(rawEmail);
        if (!limiter.tryIp(EmailCode.Purpose.RESET_PASSWORD, ip)) {
            throw AuthErrors.tooManyRequests();
        }
        if (!users.existsPasswordAccount(email)) {
            throw AuthErrors.error(HttpStatus.NOT_FOUND, "EMAIL_NOT_FOUND", "가입되지 않은 이메일이에요. 이메일을 정확히 입력해 주세요");
        }
        codes.send(email, EmailCode.Purpose.RESET_PASSWORD);
    }

    // 맞으면 10분 동안 쓸 수 있는 재설정 증명서를 준다. 그 시점의 token_version을 담아 한 번만 쓰이게 한다.
    String verifyCode(String rawEmail, String code) {
        String email = AccountRules.email(rawEmail);
        codes.verify(email, EmailCode.Purpose.RESET_PASSWORD, code);
        int tokenVersion = users.findByEmail(email).orElseThrow(PasswordResetService::expired).getTokenVersion();
        return certificates.issue(AuthCertificates.Purpose.PASSWORD_RESET, RESET_TTL,
                Map.of(EMAIL_CLAIM, email, TOKEN_VERSION_CLAIM, tokenVersion));
    }

    // 비밀번호를 바꾸고 token_version을 올려 모든 기기를 로그아웃시킨다.
    // 해시는 트랜잭션 밖에서 계산해 그동안 DB 연결을 붙잡지 않는다. 변경과 폐기만 한 트랜잭션으로 묶는다.
    void reset(String resetToken, String password, String passwordConfirm) {
        Jwt certificate = certificates.verify(resetToken, AuthCertificates.Purpose.PASSWORD_RESET)
                .orElseThrow(PasswordResetService::expired);
        AccountRules.password(password, passwordConfirm);
        String email = certificate.getClaimAsString(EMAIL_CLAIM);
        Number tokenVersion = certificate.getClaim(TOKEN_VERSION_CLAIM);
        String passwordHash = passwordEncoder.encode(password);
        transactions.executeWithoutResult(status -> {
            // UPDATE가 사용자 행을 잠그므로 refresh token 폐기와 갱신·로그인 발급이 겹치지 않는다.
            if (users.resetPassword(email, tokenVersion.intValue(), passwordHash) == 0) {
                throw expired();
            }
            Long userId = users.findByEmail(email).orElseThrow(PasswordResetService::expired).getId();
            refreshTokens.revokeAllOfUser(userId, Instant.now());
        });
        // 이메일 인증을 마친 본인이므로, 비밀번호를 잊어 걸린 로그인 잠금도 푼다.
        limiter.resetLoginFailures(email);
    }

    private static ErrorResponseException expired() {
        return AuthErrors.error(HttpStatus.BAD_REQUEST, "RESET_EXPIRED", "인증 시간이 지났어요. 인증번호를 다시 받아 주세요");
    }
}
