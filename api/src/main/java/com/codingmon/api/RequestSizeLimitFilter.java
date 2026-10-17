package com.codingmon.api;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

// 본문을 읽기 전에 큰 요청을 거절한다. API 요청은 ALB에서 바로 오고 Spring은 JSON 본문 크기를 제한하지 않는다.
// 512KB는 64KB 코드가 JSON 이스케이프로 최대 6배(약 384KB)가 돼도 통과하는 값이다.
// ponytail: Content-Length만 본다. 길이를 밝히지 않는 chunked 요청은 통과하므로 #14 보안 테스트 때 다시 본다.
@Component
class RequestSizeLimitFilter extends OncePerRequestFilter {

    static final long MAX_BODY_BYTES = 512 * 1024;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (request.getContentLengthLong() > MAX_BODY_BYTES) {
            HttpStatus status = HttpStatus.CONTENT_TOO_LARGE;
            response.setStatus(status.value());
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.getWriter().write("{\"type\":\"about:blank\",\"title\":\"%s\",\"status\":%d}"
                    .formatted(status.getReasonPhrase(), status.value()));
            return;
        }
        chain.doFilter(request, response);
    }
}
