package com.codingmon.api.auth;

import java.net.URI;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// 브라우저가 이동하는 주소다. 시작 → GitHub → 콜백 → 웹(/login/github?result=...) 순서로 간다.
@RestController
@RequestMapping("/api/auth/github")
class GitHubLoginController {

    private static final Logger log = LoggerFactory.getLogger(GitHubLoginController.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    static final String STATE_COOKIE = "github_oauth_state";
    static final String SIGNUP_COOKIE = "github_signup";

    private final GitHubClient github;
    private final GitHubLoginService logins;
    private final String webBaseUrl;

    GitHubLoginController(GitHubClient github, GitHubLoginService logins, @Value("${app.web.base-url}") String webBaseUrl) {
        this.github = github;
        this.logins = logins;
        this.webBaseUrl = webBaseUrl;
    }

    record SignupRequest(String nickname) {
    }

    @GetMapping
    ResponseEntity<Void> start() {
        if (!github.isConfigured()) {
            throw AuthErrors.error(HttpStatus.SERVICE_UNAVAILABLE, "GITHUB_UNAVAILABLE", "지금은 GitHub 로그인을 쓸 수 없어요");
        }
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        String state = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(github.authorizeUrl(state)))
                // GitHub에서 돌아오는 요청은 다른 사이트에서 오는 이동이라 Strict면 쿠키가 오지 않는다.
                .header(HttpHeaders.SET_COOKIE, cookie(STATE_COOKIE, state, Duration.ofMinutes(10), "Lax").toString())
                .build();
    }

    @GetMapping("/callback")
    ResponseEntity<Void> callback(@RequestParam(required = false) String code, @RequestParam(required = false) String state,
            @CookieValue(name = STATE_COOKIE, required = false) String expectedState) {
        ResponseEntity.BodyBuilder response = ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.SET_COOKIE, cookie(STATE_COOKIE, "", Duration.ZERO, "Lax").toString());
        // state가 다르면 다른 사이트가 시작한 로그인일 수 있어 거절한다.
        if (code == null || state == null || !state.equals(expectedState)) {
            return response.location(web("error")).build();
        }
        GitHubLoginService.Result result;
        try {
            result = logins.login(github.fetchProfile(code));
        } catch (RuntimeException e) {
            log.warn("GitHub 로그인 실패", e);
            return response.location(web("error")).build();
        }
        if (result.tokens() != null) {
            // 웹은 돌아온 뒤 /api/auth/refresh로 access token을 받는다.
            return response.location(web("success"))
                    .header(HttpHeaders.SET_COOKIE,
                            AuthController.refreshCookie(result.tokens().refreshToken(), AuthTokenService.REFRESH_TOKEN_TTL).toString())
                    .build();
        }
        return response.location(web("signup"))
                .header(HttpHeaders.SET_COOKIE, cookie(SIGNUP_COOKIE, result.signupCertificate(), GitHubLoginService.SIGNUP_TTL, "Strict").toString())
                .build();
    }

    // 가입만 하고 로그인시키지 않는다. 웹은 로그인 화면으로 보내고, 사용자는 GitHub 로그인을 다시 누른다.
    @PostMapping("/signup")
    ResponseEntity<Void> signUp(@RequestBody SignupRequest body,
            @CookieValue(name = SIGNUP_COOKIE, required = false) String certificate) {
        logins.signUp(certificate, body.nickname());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookie(SIGNUP_COOKIE, "", Duration.ZERO, "Strict").toString())
                .build();
    }

    private URI web(String result) {
        return URI.create(webBaseUrl + "/login/github?result=" + result);
    }

    private static ResponseCookie cookie(String name, String value, Duration maxAge, String sameSite) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(true)
                .sameSite(sameSite)
                .path("/api/auth/github")
                .maxAge(maxAge)
                .build();
    }
}
