package com.codingmon.api.auth;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/auth")
class AccountController {

    private final AccountService accounts;

    AccountController(AccountService accounts) {
        this.accounts = accounts;
    }

    record EmailRequest(String email) {
    }

    record VerifyCodeRequest(String email, String code) {
    }

    record VerificationResponse(String verificationToken) {
    }

    record NicknameAvailability(boolean available) {
    }

    record SignupRequest(String verificationToken, String nickname, String password, String passwordConfirm) {
    }

    record LoginRequest(String email, String password) {
    }

    @PostMapping("/signup/email-code")
    ResponseEntity<Void> sendSignupCode(@RequestBody EmailRequest body, HttpServletRequest request) {
        accounts.sendSignupCode(body.email(), request.getRemoteAddr());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/signup/email-code/verify")
    VerificationResponse verifySignupCode(@RequestBody VerifyCodeRequest body) {
        return new VerificationResponse(accounts.verifySignupCode(body.email(), body.code()));
    }

    @GetMapping("/nickname-availability")
    NicknameAvailability nicknameAvailability(@RequestParam String nickname) {
        return new NicknameAvailability(accounts.isNicknameAvailable(nickname));
    }

    // 가입만 하고 로그인시키지 않는다. 웹은 로그인 화면으로 보낸다.
    @PostMapping("/signup")
    ResponseEntity<Void> signUp(@RequestBody SignupRequest body) {
        accounts.signUp(body.verificationToken(), body.nickname(), body.password(), body.passwordConfirm());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/login")
    ResponseEntity<AuthController.AccessTokenResponse> login(@RequestBody LoginRequest body) {
        return AuthController.withTokens(accounts.login(body.email(), body.password()));
    }
}
