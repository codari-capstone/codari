package com.codingmon.api.ai;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;

// AI 처리기. 채점 슬롯과 다른 스레드에서 돌아 모델이 느려도 채점을 막지 않는다.
// 팀 서버의 모델 하나를 나눠 쓰므로 스레드 수가 곧 동시 호출 한도이고, 나머지 요청은 여기서 차례를 기다린다.
@Component
class AiWorker {

    private static final Logger log = LoggerFactory.getLogger(AiWorker.class);

    private final LlmClient llm;
    private final AiReviewRepository reviews;
    private final ExecutorService workers;

    AiWorker(LlmClient llm, AiReviewRepository reviews, @Value("${app.llm.workers}") int threads) {
        this.llm = llm;
        this.reviews = reviews;
        this.workers = Executors.newFixedThreadPool(threads, Thread.ofPlatform().name("ai-", 1).daemon(true).factory());
    }

    <T> CompletableFuture<LlmResponse<T>> submit(long reviewId, LlmRequest<T> request) {
        return CompletableFuture.supplyAsync(() -> run(reviewId, request), workers);
    }

    private <T> LlmResponse<T> run(long reviewId, LlmRequest<T> request) {
        try {
            LlmResponse<T> response = llm.complete(request);
            recordUsage(reviewId, response.usage());
            return response;
        } catch (LlmException e) {
            recordUsage(reviewId, e.usage());
            throw e;
        }
    }

    // 기록이 실패해도 이미 받은 응답이나 원래 오류를 가리지 않는다.
    private void recordUsage(long reviewId, LlmUsage usage) {
        if (usage.equals(LlmUsage.NONE)) {
            return;
        }
        try {
            reviews.addUsage(reviewId, usage);
        } catch (RuntimeException e) {
            log.warn("AI 리뷰 {}의 토큰 수를 기록하지 못했다", reviewId, e);
        }
    }

    @PreDestroy
    void stop() {
        workers.shutdownNow();
    }
}
