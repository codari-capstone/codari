package com.codingmon.api.auth;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
class AuthController {

    static final String REFRESH_COOKIE = "refresh_token";

    private final AuthTokenService tokens;

    AuthController(AuthTokenService tokens) {
        this.tokens = tokens;
    }

    record AccessTokenResponse(String accessToken) {
    }

    @PostMapping("/refresh")
    ResponseEntity<AccessTokenResponse> refresh(@CookieValue(name = REFRESH_COOKIE, required = false) String refreshToken) {
        if (refreshToken == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return withTokens(tokens.refresh(refreshToken));
    }

    // 로그인(#89)도 이 응답 형태를 쓴다.
    static ResponseEntity<AccessTokenResponse> withTokens(AuthTokenService.IssuedTokens issued) {
        ResponseCookie cookie = ResponseCookie.from(REFRESH_COOKIE, issued.refreshToken())
                .httpOnly(true)
                .secure(true)
                .sameSite("Strict")
                .path("/api/auth")
                .maxAge(AuthTokenService.REFRESH_TOKEN_TTL)
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(new AccessTokenResponse(issued.accessToken()));
    }
}
