package com.codingmon.api.ai;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class AiReviewRepository {

    private final JdbcClient jdbc;

    AiReviewRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // 실패한 행을 다시 시도해도 앞서 쓴 토큰이 사라지지 않게 더한다.
    void addUsage(long reviewId, LlmUsage usage) {
        jdbc.sql("""
                update ai_reviews
                set input_tokens = coalesce(input_tokens, 0) + :input,
                    output_tokens = coalesce(output_tokens, 0) + :output
                where id = :id
                """)
                .param("input", usage.inputTokens())
                .param("output", usage.outputTokens())
                .param("id", reviewId)
                .update();
    }
}
