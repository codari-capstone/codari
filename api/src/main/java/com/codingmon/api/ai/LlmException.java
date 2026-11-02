package com.codingmon.api.ai;

// LLM 호출이 실패했다. usage는 실패하기 전까지 쓴 토큰이다.
class LlmException extends RuntimeException {

    enum Kind {
        // 타임아웃, 연결 실패, 5xx, 설정 없음
        UNAVAILABLE,
        // 429. 모델 서버가 지금은 더 받지 못한다
        RATE_LIMITED,
        // 재요청까지 했는데도 스키마를 어긴 응답
        INVALID_RESPONSE
    }

    private final Kind kind;
    private final LlmUsage usage;

    LlmException(Kind kind, String message, Throwable cause, LlmUsage usage) {
        super(message, cause);
        this.kind = kind;
        this.usage = usage;
    }

    Kind kind() {
        return kind;
    }

    LlmUsage usage() {
        return usage;
    }
}
