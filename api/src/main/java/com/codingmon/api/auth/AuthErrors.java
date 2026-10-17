package com.codingmon.api.auth;

import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

import com.codingmon.api.ApiErrors;

// 인증 오류 모음. 본문 모양은 ApiErrors가 정한다.
final class AuthErrors {

    private AuthErrors() {
    }

    static ErrorResponseException error(HttpStatus status, String code, String detail) {
        return ApiErrors.error(status, code, detail);
    }

    static ErrorResponseException tooManyRequests() {
        return error(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS", "요청이 너무 많아요. 잠시 후 다시 시도해 주세요");
    }
}
