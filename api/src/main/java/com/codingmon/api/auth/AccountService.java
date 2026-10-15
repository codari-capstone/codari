package com.codingmon.api.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.server.ResponseStatusException;

import com.codingmon.api.user.User;
import com.codingmon.api.user.UserRepository;

// 이메일 회원가입(COM-06)과 이메일 로그인(COM-07).
@Service
class AccountService {

    static final Duration SIGNUP_VERIFICATION_TTL = Duration.ofMinutes(30);

    private static final String EMAIL_CLAIM = "email";
    private static final String LOGIN_FAILED = "이메일 또는 비밀번호가 맞지 않아요. GitHub로 가입했다면 GitHub 로그인을 이용해 주세요";

    private final UserRepository users;
    private final EmailCodeService codes;
    private final AuthRateLimiter limiter;
    private final AuthCertificates certificates;
    private final AuthTokenService tokens;
    private final PasswordEncoder passwordEncoder;
    // 없는 계정에도 같은 비용으로 비밀번호를 비교해 응답 시간으로 가입 여부가 드러나지 않게 한다.
    private final String dummyHash;

    AccountService(UserRepository users, EmailCodeService codes, AuthRateLimiter limiter, AuthCertificates certificates,
            AuthTokenService tokens, PasswordEncoder passwordEncoder) {
        this.users = users;
        this.codes = codes;
        this.limiter = limiter;
        this.certificates = certificates;
        this.tokens = tokens;
        this.passwordEncoder = passwordEncoder;
        this.dummyHash = passwordEncoder.encode("dummy-password-for-timing");
    }

    // 이미 가입된 이메일이면 보내지 않고 알린다. 이 조회는 IP 기준에만 센다.
    void sendSignupCode(String rawEmail, String ip) {
        String email = AccountRules.email(rawEmail);
        if (!limiter.tryIp(EmailCode.Purpose.VERIFY_EMAIL, ip)) {
            throw AuthErrors.tooManyRequests();
        }
        if (users.existsByEmail(email)) {
            throw emailTaken();
        }
        codes.send(email, EmailCode.Purpose.VERIFY_EMAIL);
    }

    // 맞으면 30분 동안 쓸 수 있는 가입 증명서를 준다.
    String verifySignupCode(String rawEmail, String code) {
        String email = AccountRules.email(rawEmail);
        codes.verify(email, EmailCode.Purpose.VERIFY_EMAIL, code);
        return certificates.issue(AuthCertificates.Purpose.SIGNUP, SIGNUP_VERIFICATION_TTL, Map.of(EMAIL_CLAIM, email));
    }

    // 안내용이다. 닉네임을 미리 점유하지 않고, 가입 완료 때 유일 인덱스가 최종 판정한다.
    boolean isNicknameAvailable(String nickname) {
        return !users.existsByNickname(AccountRules.nickname(nickname));
    }

    // 트랜잭션으로 감싸지 않는다. 비밀번호 해시를 계산하는 동안 DB 연결을 붙잡지 않고, 저장은 saveAndFlush 자체 트랜잭션으로 한다.
    void signUp(String verificationToken, String rawNickname, String password, String passwordConfirm) {
        String email = certificates.verify(verificationToken, AuthCertificates.Purpose.SIGNUP)
                .map(jwt -> jwt.getClaimAsString(EMAIL_CLAIM))
                .orElseThrow(() -> AuthErrors.error(HttpStatus.BAD_REQUEST, "VERIFICATION_EXPIRED",
                        "인증 시간이 지났어요. 이메일을 다시 인증해 주세요"));
        String nickname = AccountRules.nickname(rawNickname);
        AccountRules.password(password, passwordConfirm);
        if (users.existsByEmail(email)) {
            throw emailTaken();
        }
        try {
            users.saveAndFlush(new User(email, passwordEncoder.encode(password), nickname));
        } catch (DataIntegrityViolationException e) {
            // 중복 확인 뒤 다른 사람이 먼저 가입했다. 증명서가 유효한 동안 닉네임만 다시 입력받는다.
            if (String.valueOf(e.getMostSpecificCause().getMessage()).contains("users_nickname_lower_idx")) {
                throw nicknameTaken();
            }
            throw emailTaken();
        }
    }

    AuthTokenService.IssuedTokens login(String rawEmail, String password) {
        String email = rawEmail == null ? "" : rawEmail.strip();
        // 가입할 수 없는 길이라 계정이 있을 수 없다. 실패 기록에 긴 문자열이 쌓이지 않게 조회·기록 없이 같은 문구로 답한다.
        if (email.length() > AccountRules.EMAIL_MAX_LENGTH) {
            throw loginFailed();
        }
        Instant now = Instant.now();
        if (limiter.isLoginLocked(email, now)) {
            throw AuthErrors.error(HttpStatus.TOO_MANY_REQUESTS, "LOGIN_LOCKED", "로그인 시도가 너무 많아요. 5분 후 다시 시도해 주세요");
        }
        User user = users.findByEmail(email).orElse(null);
        String hash = user == null || user.getPasswordHash() == null ? dummyHash : user.getPasswordHash();
        boolean matches = passwordEncoder.matches(password == null ? "" : password, hash);
        if (user == null || user.getPasswordHash() == null || !matches) {
            // 없는 이메일, GitHub 가입 계정, 비밀번호 불일치 모두 같은 문구로 답한다.
            limiter.recordLoginFailure(email, now);
            throw loginFailed();
        }
        limiter.resetLoginFailures(email);
        try {
            return tokens.issue(user);
        } catch (ResponseStatusException e) {
            // 그사이 비밀번호가 재설정됐다. 옛 비밀번호로는 로그인시키지 않는다.
            throw loginFailed();
        }
    }

    private static ErrorResponseException loginFailed() {
        return AuthErrors.error(HttpStatus.UNAUTHORIZED, "LOGIN_FAILED", LOGIN_FAILED);
    }

    static ErrorResponseException emailTaken() {
        return AuthErrors.error(HttpStatus.CONFLICT, "EMAIL_TAKEN", "이미 가입된 이메일이에요");
    }

    static ErrorResponseException nicknameTaken() {
        return AuthErrors.error(HttpStatus.CONFLICT, "NICKNAME_TAKEN", "이미 사용 중인 닉네임이에요");
    }
}
