package com.codingmon.api.judge;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.codingmon.api.judge.JudgeRepository.CaseRow;
import com.codingmon.api.judge.JudgeRepository.Job;
import com.codingmon.api.submission.SubmissionQueued;

import jakarta.annotation.PreDestroy;

// 채점 처리기(JUDGE-001, RES-01). QUEUED 제출을 선점해 Judge0로 채점하고 케이스·제출 결과를 DB에 쓴다.
// 실행 슬롯은 2개다. 제출 하나가 슬롯 하나를 쓰고, 그 제출의 케이스는 Judge0 큐에서 차례로 돈다.
// API 서버가 한 대라고 가정한다. 시작할 때 진행 중으로 남은 제출은 이 서버가 맡던 것으로 보고 이어서 처리한다.
@Component
class JudgeWorker {

    private static final Logger log = LoggerFactory.getLogger(JudgeWorker.class);

    static final int SLOTS = 2;

    private static final Duration POLL_INTERVAL = Duration.ofMillis(500);

    // cpu_time_limit가 아니라 Judge0 큐 대기까지 고려한 기한이다(judge-verdict-mapping.md 6절).
    private static final Duration POLL_DEADLINE = Duration.ofMinutes(10);

    private static final CaseOutcome PENDING = new CaseOutcome.Pending();

    private final JudgeRepository jobs;
    private final Judge0Client judge0;
    private final Semaphore slots = new Semaphore(SLOTS);
    // 재시작 전에 진행 중이던 제출. 새 제출보다 먼저 맡는다.
    private final Queue<Long> resumable = new ConcurrentLinkedQueue<>();
    // 선점은 이 스레드에서만 한다. 커밋 뒤 이벤트 리스너에서 바로 DB를 쓰면 끝난 트랜잭션의 연결에 묶여 커밋되지 않는다.
    private final ExecutorService dispatcher =
            Executors.newSingleThreadExecutor(Thread.ofPlatform().name("judge-dispatch").daemon(true).factory());
    private final ExecutorService workers =
            Executors.newFixedThreadPool(SLOTS, Thread.ofPlatform().name("judge-", 1).daemon(true).factory());
    private volatile boolean started;

    JudgeWorker(JudgeRepository jobs, Judge0Client judge0) {
        this.jobs = jobs;
        this.judge0 = judge0;
    }

    @EventListener(ApplicationReadyEvent.class)
    void start() {
        if (!judge0.isConfigured()) {
            log.warn("JUDGE0_URL이 비어 있어 채점 처리기를 켜지 않는다. 제출과 예제 실행은 QUEUED로 남는다");
            return;
        }
        // 선점을 시작하기 전에 모은다. 그래야 이번에 선점한 제출을 재시작 전 것으로 보고 두 번 돌리지 않는다.
        resumable.addAll(jobs.findInProgress());
        started = true;
        wake();
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void onQueued(SubmissionQueued event) {
        wake();
    }

    // 슬롯이 꽉 찼을 때 들어온 제출을 줍는다.
    @Scheduled(fixedDelay = 5_000)
    void sweep() {
        wake();
    }

    void wake() {
        if (!started) {
            return;
        }
        try {
            dispatcher.execute(this::dispatch);
        } catch (RejectedExecutionException e) {
            // 서버가 내려가는 중이다.
        }
    }

    @PreDestroy
    void stop() {
        started = false;
        dispatcher.shutdownNow();
        // 폴링 중인 슬롯은 진행 중 상태로 남고, 다음 시작 때 저장된 토큰으로 이어서 처리한다.
        workers.shutdownNow();
    }

    private void dispatch() {
        while (slots.tryAcquire()) {
            Long id;
            try {
                id = resumable.isEmpty() ? jobs.claimNext().orElse(null) : resumable.poll();
            } catch (RuntimeException e) {
                slots.release();
                log.warn("채점할 제출을 고르지 못했다. 다음 확인 때 다시 고른다", e);
                return;
            }
            if (id == null) {
                slots.release();
                return;
            }
            long claimed = id;
            workers.execute(() -> {
                try {
                    judge(claimed);
                } finally {
                    slots.release();
                    wake();
                }
            });
        }
    }

    private void judge(long id) {
        try {
            Job job = jobs.load(id).orElse(null);
            if (job == null) {
                log.warn("제출 {}의 언어 설정이 없어 채점할 수 없다", id);
                jobs.fail(id);
                return;
            }
            run(job);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException e) {
            if (Thread.currentThread().isInterrupted()) {
                return;
            }
            if (e instanceof Judge0Exception) {
                log.warn("제출 {}을 채점하지 못했다: {}", id, e.getMessage());
            } else {
                log.error("제출 {}을 채점하다 오류가 났다", id, e);
            }
            jobs.fail(id);
        }
    }

    private void run(Job job) throws InterruptedException {
        long id = job.id();
        Map<Long, CaseOutcome> outcomes = new HashMap<>();
        Map<Long, String> tokens = new HashMap<>();
        List<CaseRow> unsent = new ArrayList<>();
        for (CaseRow c : job.cases()) {
            if (c.verdict() != null) {
                outcomes.put(c.testCaseId(), new CaseOutcome.Judged(c.verdict(), c.errorType(), c.timeMs(), c.memoryKb()));
            } else if (c.resultId() == null) {
                outcomes.put(c.testCaseId(), PENDING);
                unsent.add(c);
            } else if (c.token() == null) {
                // 보내다 끊긴 케이스다. 들어갔는지 알 수 없어 다시 보내면 같은 코드가 두 번 실행될 수 있다(6절).
                log.warn("제출 {}에 토큰 없는 케이스가 있어 채점 불가로 끝낸다", id);
                jobs.fail(id);
                return;
            } else {
                outcomes.put(c.testCaseId(), PENDING);
                tokens.put(c.testCaseId(), c.token());
            }
        }
        boolean hasSample = job.cases().stream().anyMatch(CaseRow::sample);
        CaseJudge.Limits limits = Judge0Client.judgeLimits(job.memoryLimitMb());
        Set<Long> resubmitted = new HashSet<>();
        Instant deadline = Instant.now().plus(POLL_DEADLINE);
        int shownProgress = -1;
        while (true) {
            // 공개 예제를 먼저 보내고, 예제가 하나라도 컴파일된 뒤 나머지를 보낸다. 컴파일 에러인 코드가
            // 비공개 케이스마다 컴파일하며 채점 서버를 붙잡지 않게 하고, 예제에서 난 에러를 먼저 보여 준다.
            if (!unsent.isEmpty()) {
                boolean compiled = !hasSample || job.cases().stream()
                        .anyMatch(c -> c.sample() && outcomes.get(c.testCaseId()) instanceof CaseOutcome.Judged);
                List<CaseRow> batch = compiled ? List.copyOf(unsent) : unsent.stream().filter(CaseRow::sample).toList();
                send(job, batch, tokens);
                unsent.removeAll(batch);
            }
            SubmissionOutcome decision = SubmissionOutcome.combine(job.cases().stream()
                    .map(c -> new SubmissionOutcome.Case(c.sample(), outcomes.get(c.testCaseId()))).toList());
            if (!(decision instanceof SubmissionOutcome.InProgress progress)) {
                finish(id, decision);
                return;
            }
            // 첫 케이스 결과가 나오기 전까지는 '채점 준비 중'(COMPILING)으로 둔다.
            boolean anyJudged = outcomes.values().stream().anyMatch(o -> o instanceof CaseOutcome.Judged);
            if (anyJudged && progress.progress() != shownProgress) {
                jobs.markRunning(id, progress.progress());
                shownProgress = progress.progress();
            }
            if (Instant.now().isAfter(deadline)) {
                log.warn("제출 {}이 {} 안에 끝나지 않아 채점 불가로 끝낸다", id, POLL_DEADLINE);
                jobs.fail(id);
                return;
            }
            Thread.sleep(POLL_INTERVAL);
            poll(job, limits, outcomes, tokens, resubmitted);
        }
    }

    // 케이스 행을 먼저 만들고 보낸다. 토큰을 받기 전에 끊기면 토큰이 빈 행이 남아 재시작 때 채점 불가로 끝난다.
    private void send(Job job, List<CaseRow> batch, Map<Long, String> tokens) {
        for (int from = 0; from < batch.size(); from += Judge0Client.MAX_BATCH) {
            List<CaseRow> chunk = batch.subList(from, Math.min(from + Judge0Client.MAX_BATCH, batch.size()));
            jobs.insertCaseRows(job.id(), job.versionId(), chunk.stream().map(CaseRow::testCaseId).toList());
            List<String> sent = judge0.submit(job.language(), job.sourceCode(), job.timeLimitMs(), job.memoryLimitMb(),
                    chunk.stream().map(CaseRow::input).toList());
            for (int i = 0; i < chunk.size(); i++) {
                jobs.saveToken(job.id(), chunk.get(i).testCaseId(), sent.get(i));
                tokens.put(chunk.get(i).testCaseId(), sent.get(i));
            }
        }
    }

    private void poll(Job job, CaseJudge.Limits limits, Map<Long, CaseOutcome> outcomes, Map<Long, String> tokens,
            Set<Long> resubmitted) {
        List<CaseRow> waiting = job.cases().stream()
                .filter(c -> outcomes.get(c.testCaseId()) instanceof CaseOutcome.Pending && tokens.containsKey(c.testCaseId()))
                .toList();
        if (waiting.isEmpty()) {
            return;
        }
        Map<String, Judge0Result> results = judge0.fetch(waiting.stream().map(c -> tokens.get(c.testCaseId())).toList());
        for (CaseRow c : waiting) {
            Judge0Result result = results.get(tokens.get(c.testCaseId()));
            if (result.statusId() == 1 || result.statusId() == 2) {
                continue;
            }
            CaseOutcome outcome = CaseJudge.judge(job.language(), c.sample(), result,
                    c.expectedOutput().getBytes(StandardCharsets.UTF_8), limits);
            switch (outcome) {
                case CaseOutcome.Judged judged -> {
                    // 실행됐는데 출력이 없으면 빈 문자열로 둬 실행 전(null)과 구분한다.
                    String stdout = c.sample() ? (result.stdout() == null ? "" : StoredText.of(result.stdout())) : null;
                    String stderr = c.sample() ? StoredText.of(result.stderr()) : null;
                    jobs.saveCaseResult(job.id(), c.testCaseId(), judged, stdout, stderr);
                    outcomes.put(c.testCaseId(), judged);
                }
                case CaseOutcome.InternalError error -> {
                    if (resubmitted.add(c.testCaseId())) {
                        // Judge0 내부 오류는 같은 케이스를 한 번만 다시 보낸다(3절 3번). 또 나오면 채점 불가다.
                        String token = judge0.submit(job.language(), job.sourceCode(), job.timeLimitMs(), job.memoryLimitMb(),
                                List.of(c.input())).getFirst();
                        jobs.saveToken(job.id(), c.testCaseId(), token);
                        tokens.put(c.testCaseId(), token);
                    } else {
                        outcomes.put(c.testCaseId(), error);
                    }
                }
                default -> outcomes.put(c.testCaseId(), outcome);
            }
        }
    }

    private void finish(long id, SubmissionOutcome decision) {
        switch (decision) {
            case SubmissionOutcome.Completed c ->
                jobs.complete(id, c.verdict(), c.runtimeErrorType(), null, c.timeMs(), c.memoryKb());
            case SubmissionOutcome.CompileError c -> jobs.complete(id, Verdict.COMPILE_ERROR, null, c.message(), null, null);
            case SubmissionOutcome.JudgeError e -> {
                log.warn("제출 {}을 채점 불가로 끝낸다: {}", id, e.reason());
                jobs.fail(id);
            }
            case SubmissionOutcome.InProgress p -> throw new IllegalStateException("진행 중인 제출을 끝내려 했다: " + id);
        }
    }
}
