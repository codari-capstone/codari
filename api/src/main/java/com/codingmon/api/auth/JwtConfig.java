package com.codingmon.api.auth;

import java.util.Base64;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import com.codingmon.api.user.UserRepository;
import com.nimbusds.jose.jwk.source.ImmutableSecret;

@Configuration
class JwtConfig {

    static final String ROLE_CLAIM = "role";
    static final String TOKEN_VERSION_CLAIM = "ver";

    private final SecretKey key;

    JwtConfig(@Value("${app.jwt.secret}") String base64Secret) {
        byte[] secret = Base64.getDecoder().decode(base64Secret);
        if (secret.length < 32) {
            throw new IllegalStateException("app.jwt.secret은 32바이트 이상이어야 한다 (HS256)");
        }
        this.key = new SecretKeySpec(secret, "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder() {
        return new NimbusJwtEncoder(new ImmutableSecret<>(key));
    }

    @Bean
    JwtDecoder jwtDecoder(UserRepository users) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key).build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(), tokenVersion(users)));
        return decoder;
    }

    // 요청마다 DB의 token_version과 비교한다. 비밀번호를 재설정하면 값이 올라 기존 토큰이 바로 막히고,
    // 탈퇴로 사용자 행이 없으면 값을 찾지 못해 막힌다.
    private static OAuth2TokenValidator<Jwt> tokenVersion(UserRepository users) {
        OAuth2Error invalid = new OAuth2Error(OAuth2ErrorCodes.INVALID_TOKEN, "토큰이 더 이상 유효하지 않다", null);
        return jwt -> {
            Number version = jwt.getClaim(TOKEN_VERSION_CLAIM);
            boolean valid = version != null && users.findTokenVersionById(Long.valueOf(jwt.getSubject()))
                    .filter(current -> current == version.intValue())
                    .isPresent();
            return valid ? OAuth2TokenValidatorResult.success() : OAuth2TokenValidatorResult.failure(invalid);
        };
    }
}
