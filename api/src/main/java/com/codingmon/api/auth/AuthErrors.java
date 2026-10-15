package com.codingmon.api.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

// 화면이 경우를 나눠 처리하도록 RFC 9457 본문에 code를, 그대로 보여 줄 문구를 detail에 담는다.
final class AuthErrors {

    private AuthErrors() {
    }

    static ErrorResponseException error(HttpStatus status, String code, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setProperty("code", code);
        return new ErrorResponseException(status, problem, null);
    }

    static ErrorResponseException tooManyRequests() {
        return error(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS", "요청이 너무 많아요. 잠시 후 다시 시도해 주세요");
    }
}
