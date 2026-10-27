package com.codingmon.api;

import java.io.IOException;
import java.util.regex.Pattern;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

// 본문을 읽기 전에 큰 요청을 거절한다. API 요청은 ALB에서 바로 오고 Spring은 JSON 본문 크기를 제한하지 않는다.
// 512KB는 64KB 코드가 JSON 이스케이프로 최대 6배(약 384KB)가 돼도 통과하는 값이다.
// ponytail: Content-Length만 본다. 길이를 밝히지 않는 chunked 요청은 통과하므로 #14 보안 테스트 때 다시 본다.
// 로그인 확인(토큰 검증 DB 조회)보다 먼저 거절하도록 맨 앞에 둔다.
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class RequestSizeLimitFilter extends OncePerRequestFilter {

    static final long MAX_BODY_BYTES = 512 * 1024;

    // 관리자 테스트케이스 저장·ZIP 읽기는 케이스 합 10MiB를 받는다(#34). 이 두 주소만 따로 둔다.
    // 저장은 JSON이 줄바꿈을 두 글자(\n)로 늘리므로 두 배에 여유를 더했고, ZIP은 파일 10MiB에 multipart 머리말 여유를 더했다.
    static final long MAX_TEST_CASES_BODY_BYTES = 24L * 1024 * 1024;
    static final long MAX_TEST_CASE_ZIP_BODY_BYTES = 11L * 1024 * 1024;

    private static final Pattern TEST_CASES = Pattern.compile("/api/admin/problems/[^/]+/test-cases");
    private static final Pattern TEST_CASE_ZIP = Pattern.compile("/api/admin/problems/[^/]+/test-cases/zip");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (request.getContentLengthLong() > maxBodyBytes(request)) {
            ApiErrors.write(response, HttpStatus.CONTENT_TOO_LARGE);
            return;
        }
        chain.doFilter(request, response);
    }

    private static long maxBodyBytes(HttpServletRequest request) {
        String path = request.getRequestURI();
        if ("PUT".equals(request.getMethod()) && TEST_CASES.matcher(path).matches()) {
            return MAX_TEST_CASES_BODY_BYTES;
        }
        if ("POST".equals(request.getMethod()) && TEST_CASE_ZIP.matcher(path).matches()) {
            return MAX_TEST_CASE_ZIP_BODY_BYTES;
        }
        return MAX_BODY_BYTES;
    }
}
