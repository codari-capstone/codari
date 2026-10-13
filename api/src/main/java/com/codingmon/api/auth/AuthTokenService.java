package com.codingmon.api.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.codingmon.api.user.User;
import com.codingmon.api.user.UserRepository;

@Service
public class AuthTokenService {

    static final Duration ACCESS_TOKEN_TTL = Duration.ofMinutes(30);
    static final Duration REFRESH_TOKEN_TTL = Duration.ofDays(7);

    private static final SecureRandom RANDOM = new SecureRandom();

    private final JwtEncoder jwtEncoder;
    private final RefreshTokenRepository refreshTokens;
    private final UserRepository users;

    AuthTokenService(JwtEncoder jwtEncoder, RefreshTokenRepository refreshTokens, UserRepository users) {
        this.jwtEncoder = jwtEncoder;
        this.refreshTokens = refreshTokens;
        this.users = users;
    }

    public record IssuedTokens(String accessToken, String refreshToken) {
    }

    /** 로그인에 성공한 사용자에게 새 토큰 묶음을 발급한다. */
    @Transactional
    public IssuedTokens issue(User user) {
        return new IssuedTokens(accessToken(user), saveRefreshToken(user.getId(), UUID.randomUUID()).raw());
    }

    // 실패해도 묶음 폐기는 남겨야 하므로 예외로 롤백하지 않는다.
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public IssuedTokens refresh(String rawRefreshToken) {
        Instant now = Instant.now();
        RefreshToken current = refreshTokens.findByTokenHash(hash(rawRefreshToken)).orElseThrow(AuthTokenService::unauthorized);
        if (current.isReplaced()) {
            // 이미 교체된 토큰이 다시 왔다면 탈취로 보고 같은 묶음을 모두 폐기한다.
            // ponytail: 두 탭이 같은 토큰으로 동시에 갱신해도 여기 걸려 로그아웃된다. 문제가 되면 짧은 유예 시간을 둔다.
            refreshTokens.revokeFamily(current.getFamilyId(), now);
            throw unauthorized();
        }
        if (current.isRevoked() || current.isExpired(now)) {
            throw unauthorized();
        }
        // 탈퇴하면 토큰 행도 함께 지워지므로 사용자는 항상 있다.
        User user = users.findById(current.getUserId()).orElseThrow(AuthTokenService::unauthorized);
        NewRefreshToken next = saveRefreshToken(user.getId(), current.getFamilyId());
        current.replaceWith(next.token(), now);
        return new IssuedTokens(accessToken(user), next.raw());
    }

    private String accessToken(User user) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(user.getId().toString())
                .issuedAt(now)
                .expiresAt(now.plus(ACCESS_TOKEN_TTL))
                .claim(JwtConfig.ROLE_CLAIM, user.getRole().name())
                .claim(JwtConfig.TOKEN_VERSION_CLAIM, user.getTokenVersion())
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    private record NewRefreshToken(RefreshToken token, String raw) {
    }

    private NewRefreshToken saveRefreshToken(Long userId, UUID familyId) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        RefreshToken token = refreshTokens.save(
                new RefreshToken(userId, hash(raw), familyId, Instant.now().plus(REFRESH_TOKEN_TTL)));
        return new NewRefreshToken(token, raw);
    }

    // 원문은 저장하지 않는다. 무작위 32바이트라 솔트 없는 SHA-256으로 충분하다.
    private static String hash(String raw) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static ResponseStatusException unauthorized() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED);
    }
}
