package com.codingmon.api.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;

// 이메일 인증 등을 마쳤다는 서버 서명 증명서. DB에 저장하지 않고 서명·만료로만 확인한다.
// access token과 같은 키로 서명하므로, purpose 클레임이 있는 토큰은 access token으로 받지 않는다(JwtConfig).
class AuthCertificates {

    static final String PURPOSE_CLAIM = "purpose";

    enum Purpose {
        SIGNUP, PASSWORD_RESET
    }

    private final JwtEncoder encoder;
    private final JwtDecoder decoder;

    AuthCertificates(JwtEncoder encoder, JwtDecoder decoder) {
        this.encoder = encoder;
        this.decoder = decoder;
    }

    String issue(Purpose purpose, Duration ttl, Map<String, Object> claims) {
        Instant now = Instant.now();
        JwtClaimsSet.Builder builder = JwtClaimsSet.builder()
                .issuedAt(now)
                .expiresAt(now.plus(ttl))
                .claim(PURPOSE_CLAIM, purpose.name());
        claims.forEach(builder::claim);
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, builder.build())).getTokenValue();
    }

    Optional<Jwt> verify(String token, Purpose purpose) {
        if (token == null) {
            return Optional.empty();
        }
        try {
            Jwt jwt = decoder.decode(token);
            return purpose.name().equals(jwt.getClaimAsString(PURPOSE_CLAIM)) ? Optional.of(jwt) : Optional.empty();
        } catch (JwtException e) {
            return Optional.empty();
        }
    }
}
