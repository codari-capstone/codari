package com.codingmon.api.auth;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.ErrorResponseException;

import com.codingmon.api.user.User;
import com.codingmon.api.user.UserRepository;

// GitHub 로그인(COM-02). GitHub 고유 ID로 계정을 찾고, 처음이면 닉네임만 받아 가입시킨다.
@Service
class GitHubLoginService {

    static final Duration SIGNUP_TTL = Duration.ofMinutes(30);

    private static final String GITHUB_ID_CLAIM = "githubId";
    private static final String LOGIN_CLAIM = "login";
    private static final String AVATAR_CLAIM = "avatarUrl";

    // 이미 가입한 계정이면 tokens, 처음이면 signupCertificate 중 하나만 채운다.
    record Result(AuthTokenService.IssuedTokens tokens, String signupCertificate) {
    }

    private final OAuthAccountRepository accounts;
    private final UserRepository users;
    private final AuthCertificates certificates;
    private final AuthTokenService tokens;

    GitHubLoginService(OAuthAccountRepository accounts, UserRepository users, AuthCertificates certificates,
            AuthTokenService tokens) {
        this.accounts = accounts;
        this.users = users;
        this.certificates = certificates;
        this.tokens = tokens;
    }

    @Transactional
    public Result login(GitHubClient.Profile profile) {
        return accounts.findByProviderAndProviderUserId(OAuthAccount.GITHUB, profile.id())
                .map(account -> {
                    account.updateUsername(profile.login());
                    User user = users.findById(account.getUserId()).orElseThrow();
                    return new Result(tokens.issue(user), null);
                })
                .orElseGet(() -> new Result(null, signupCertificate(profile)));
    }

    // 증명서가 유효한 동안 닉네임이 선점되면 닉네임만 다시 입력받는다.
    @Transactional
    public void signUp(String certificate, String rawNickname) {
        Jwt jwt = certificates.verify(certificate, AuthCertificates.Purpose.GITHUB_SIGNUP)
                .orElseThrow(() -> AuthErrors.error(HttpStatus.BAD_REQUEST, "VERIFICATION_EXPIRED",
                        "인증 시간이 지났어요. GitHub 로그인을 다시 해 주세요"));
        String nickname = AccountRules.nickname(rawNickname);
        String githubId = jwt.getClaimAsString(GITHUB_ID_CLAIM);
        if (accounts.findByProviderAndProviderUserId(OAuthAccount.GITHUB, githubId).isPresent()) {
            throw alreadyRegistered();
        }
        try {
            User user = users.saveAndFlush(User.github(nickname, jwt.getClaimAsString(AVATAR_CLAIM)));
            accounts.saveAndFlush(new OAuthAccount(user.getId(), githubId, jwt.getClaimAsString(LOGIN_CLAIM)));
        } catch (DataIntegrityViolationException e) {
            if (AccountService.isNicknameConflict(e)) {
                throw AccountService.nicknameTaken();
            }
            // 같은 GitHub 계정으로 동시에 가입했다.
            throw alreadyRegistered();
        }
    }

    private static ErrorResponseException alreadyRegistered() {
        return AuthErrors.error(HttpStatus.CONFLICT, "ALREADY_REGISTERED", "이미 가입한 GitHub 계정이에요. GitHub 로그인을 다시 해 주세요");
    }

    private String signupCertificate(GitHubClient.Profile profile) {
        Map<String, Object> claims = new HashMap<>();
        claims.put(GITHUB_ID_CLAIM, profile.id());
        claims.put(LOGIN_CLAIM, profile.login());
        if (profile.avatarUrl() != null) {
            claims.put(AVATAR_CLAIM, profile.avatarUrl());
        }
        return certificates.issue(AuthCertificates.Purpose.GITHUB_SIGNUP, SIGNUP_TTL, claims);
    }
}
