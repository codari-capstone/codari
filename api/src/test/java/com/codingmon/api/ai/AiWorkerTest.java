package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class AiWorkerTest {

    private static final LlmRequest<String> REQUEST = new LlmRequest<>("시스템", "사용자", "answer", Map.of(), String.class);

    private final List<String> recorded = new CopyOnWriteArrayList<>();
    private AiWorker worker;

    @AfterEach
    void tearDown() {
        worker.stop();
    }

    private AiWorker worker(int threads, Supplier<LlmResponse<String>> answer) {
        worker = new AiWorker(new FakeLlm(answer), new RecordingRepository(), threads);
        return worker;
    }

    private static LlmResponse<String> answer(LlmUsage usage) {
        return new LlmResponse<>("값", "\"값\"", usage);
    }

    @Test
    void 응답을_돌려주고_토큰을_기록한다() throws Exception {
        LlmResponse<String> response = worker(1, () -> answer(new LlmUsage(120, 45))).submit(7, REQUEST).get(5, TimeUnit.SECONDS);

        assertThat(response.value()).isEqualTo("값");
        assertThat(recorded).containsExactly("7:120:45");
    }

    @Test
    void 실패해도_쓴_토큰을_기록하고_오류를_넘긴다() {
        LlmException failure = new LlmException(LlmException.Kind.INVALID_RESPONSE, "스키마 위반", null, new LlmUsage(200, 20));

        CompletableFuture<LlmResponse<String>> result = worker(1, () -> {
            throw failure;
        }).submit(7, REQUEST);

        assertThatThrownBy(() -> result.get(5, TimeUnit.SECONDS))
                .isInstanceOf(ExecutionException.class).hasCause(failure);
        assertThat(recorded).containsExactly("7:200:20");
    }

    @Test
    void 쓴_토큰이_없으면_기록하지_않는다() {
        CompletableFuture<LlmResponse<String>> result = worker(1, () -> {
            throw new LlmException(LlmException.Kind.UNAVAILABLE, "장애", null, LlmUsage.NONE);
        }).submit(7, REQUEST);

        assertThatThrownBy(() -> result.get(5, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class);
        assertThat(recorded).isEmpty();
    }

    @Test
    void 기록이_실패해도_응답을_버리지_않는다() throws Exception {
        AiReviewRepository broken = new AiReviewRepository(null) {
            @Override
            void addUsage(long reviewId, LlmUsage usage) {
                throw new IllegalStateException("DB 장애");
            }
        };
        worker = new AiWorker(new FakeLlm(() -> answer(new LlmUsage(1, 1))), broken, 1);

        assertThat(worker.submit(7, REQUEST).get(5, TimeUnit.SECONDS).value()).isEqualTo("값");
    }

    @Test
    void 모델이_멈춰도_호출한_스레드는_막히지_않고_동시_호출은_스레드_수를_넘지_않는다() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch firstStarted = new CountDownLatch(1);
        AtomicInteger started = new AtomicInteger();
        List<String> threads = new CopyOnWriteArrayList<>();
        AiWorker slow = worker(1, () -> {
            threads.add(Thread.currentThread().getName());
            started.incrementAndGet();
            firstStarted.countDown();
            try {
                release.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return answer(LlmUsage.NONE);
        });

        CompletableFuture<LlmResponse<String>> first = slow.submit(1, REQUEST);
        CompletableFuture<LlmResponse<String>> second = slow.submit(2, REQUEST);

        assertThat(firstStarted.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(first).isNotDone();
        assertThat(second).isNotDone();
        assertThat(started).hasValue(1);

        release.countDown();
        CompletableFuture.allOf(first, second).get(5, TimeUnit.SECONDS);
        assertThat(started).hasValue(2);
        assertThat(threads).allSatisfy(name -> assertThat(name).startsWith("ai-"));
    }

    private final class RecordingRepository extends AiReviewRepository {

        RecordingRepository() {
            super(null);
        }

        @Override
        void addUsage(long reviewId, LlmUsage usage) {
            recorded.add(reviewId + ":" + usage.inputTokens() + ":" + usage.outputTokens());
        }
    }

    private record FakeLlm(Supplier<LlmResponse<String>> answer) implements LlmClient {

        @Override
        public String model() {
            return "test-model";
        }

        @Override
        public String promptVersion() {
            return "v1";
        }

        @Override
        @SuppressWarnings("unchecked")
        public <T> LlmResponse<T> complete(LlmRequest<T> request) {
            return (LlmResponse<T>) answer.get();
        }
    }
}
