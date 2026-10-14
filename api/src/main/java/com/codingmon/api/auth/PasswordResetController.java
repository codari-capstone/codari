package com.codingmon.api.auth;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/auth/password-reset")
class PasswordResetController {

    private final PasswordResetService resets;

    PasswordResetController(PasswordResetService resets) {
        this.resets = resets;
    }

    record ResetTokenResponse(String resetToken) {
    }

    record ResetRequest(String resetToken, String password, String passwordConfirm) {
    }

    @PostMapping("/email-code")
    ResponseEntity<Void> sendCode(@RequestBody AccountController.EmailRequest body, HttpServletRequest request) {
        resets.sendCode(body.email(), request.getRemoteAddr());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/email-code/verify")
    ResetTokenResponse verifyCode(@RequestBody AccountController.VerifyCodeRequest body) {
        return new ResetTokenResponse(resets.verifyCode(body.email(), body.code()));
    }

    @PostMapping
    ResponseEntity<Void> reset(@RequestBody ResetRequest body) {
        resets.reset(body.resetToken(), body.password(), body.passwordConfirm());
        return ResponseEntity.noContent().build();
    }
}
