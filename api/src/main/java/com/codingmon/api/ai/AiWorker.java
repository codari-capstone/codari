package com.codingmon.api.ai;

import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;

// AI 처리기. 채점 슬롯과 다른 스레드에서 돌아 모델이 느려도 채점을 막지 않는다.
// 팀 서버의 모델 하나를 나눠 쓰므로 스레드 수가 곧 동시 호출 한도이고, 나머지 요청은 대기열에서 차례를 기다린다.
// 대기열이 차면 더 쌓지 않고 바로 RATE_LIMITED로 돌려준다.
@Component
class AiWorker {

    private static final Logger log = LoggerFactory.getLogger(AiWorker.class);

    private final LlmClient llm;
    private final AiReviewRepository reviews;
    private final ExecutorService workers;
    // 서버가 내려갈 때 끝내 줄 요청. 대기열에서 버려지는 작업의 future는 스스로 끝나지 않는다.
    private final Set<CompletableFuture<?>> pending = ConcurrentHashMap.newKeySet();

    AiWorker(LlmClient llm, AiReviewRepository reviews, @Value("${app.llm.workers}") int threads,
            @Value("${app.llm.queue-capacity}") int queueCapacity) {
        this.llm = llm;
        this.reviews = reviews;
        this.workers = new ThreadPoolExecutor(threads, threads, 0L, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(queueCapacity), Thread.ofPlatform().name("ai-", 1).daemon(true).factory());
    }

    <T> CompletableFuture<LlmResponse<T>> submit(long reviewId, LlmRequest<T> request) {
        CompletableFuture<LlmResponse<T>> result;
        try {
            result = CompletableFuture.supplyAsync(() -> run(reviewId, request), workers);
        } catch (RejectedExecutionException e) {
            LlmException.Kind kind = workers.isShutdown() ? LlmException.Kind.UNAVAILABLE : LlmException.Kind.RATE_LIMITED;
            return CompletableFuture.failedFuture(new LlmException(kind, "AI 요청을 받을 수 없다", e, LlmUsage.NONE));
        }
        pending.add(result);
        result.whenComplete((response, failure) -> pending.remove(result));
        return result;
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
        LlmException stopped = new LlmException(LlmException.Kind.UNAVAILABLE, "서버가 내려가는 중이다", null, LlmUsage.NONE);
        pending.forEach(task -> task.completeExceptionally(stopped));
    }
}
