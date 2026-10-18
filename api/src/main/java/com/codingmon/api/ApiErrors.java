package com.codingmon.api;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

import jakarta.servlet.http.HttpServletResponse;

// 화면이 경우를 나눠 처리하도록 RFC 9457 본문에 code를, 그대로 보여 줄 문구를 detail에 담는다.
public final class ApiErrors {

    private ApiErrors() {
    }

    public static ErrorResponseException error(HttpStatus status, String code, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setProperty("code", code);
        return new ErrorResponseException(status, problem, null);
    }

    // 필터 단계 오류는 MVC 예외 처리를 거치지 않으므로 RFC 9457 본문을 직접 쓴다.
    public static void write(HttpServletResponse response, HttpStatus status) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getWriter().write("{\"type\":\"about:blank\",\"title\":\"%s\",\"status\":%d}"
                .formatted(status.getReasonPhrase(), status.value()));
    }
}
