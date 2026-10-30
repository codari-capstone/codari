package com.codingmon.api.judge;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.codingmon.api.Language;
import com.codingmon.api.problem.SolutionValidationRepository;
import com.codingmon.api.submission.UserProblemStatsRepository;

// 채점 처리기의 DB 읽기·쓰기. Judge0를 부르는 동안 잠금을 잡지 않도록 함수마다 짧게 끝난다.
// 상태 갱신은 진행 중(QUEUED·COMPILING·RUNNING)인 제출에만 한다. 끝난 제출이 다시 바뀌지 않게 한다.
@Repository
class JudgeRepository {

    // 채점할 제출과 그 버전·언어의 제한값. cases는 실행 대상 케이스를 채점 순서로 담는다.
    record Job(long id, long versionId, Language language, String sourceCode, int timeLimitMs, int memoryLimitMb,
            List<CaseRow> cases) {
    }

    // resultId가 null이면 아직 채점 서버에 보내지 않은 케이스다. token이 null이면 보내다 끊긴 케이스다.
    // retried는 Judge0 내부 오류(status 13)로 이미 한 번 다시 보낸 케이스다.
    record CaseRow(long testCaseId, boolean sample, String input, String expectedOutput, Long resultId, String token,
            Verdict verdict, RuntimeErrorType errorType, Integer timeMs, Integer memoryKb, boolean retried) {
    }

    private static final String ACTIVE = "('QUEUED', 'COMPILING', 'RUNNING')";

    private final JdbcClient jdbc;
    private final UserProblemStatsRepository stats;
    private final SolutionValidationRepository validations;

    JudgeRepository(JdbcClient jdbc, UserProblemStatsRepository stats, SolutionValidationRepository validations) {
        this.jdbc = jdbc;
        this.stats = stats;
        this.validations = validations;
    }

    // 가장 오래 기다린 제출을 COMPILING으로 바꿔 선점한다. 다른 트랜잭션이 잡고 있는 행은 건너뛴다.
    Optional<Long> claimNext() {
        return jdbc.sql("update submissions set job_status = 'COMPILING' where id = ("
                + " select id from submissions where job_status = 'QUEUED'"
                + " order by submitted_at, id limit 1 for update skip locked) returning id")
                .query(Long.class)
                .optional();
    }

    List<Long> findInProgress() {
        return jdbc.sql("select id from submissions where job_status in ('COMPILING', 'RUNNING') order by submitted_at, id")
                .query(Long.class)
                .list();
    }

    // 그 언어의 설정이 없으면(공개 뒤 언어가 빠진 버전) 비어 있다.
    // 예제 실행은 SAMPLE만, 제출·검증은 전체를 SAMPLE 먼저 ordinal 순으로 돈다(AI_FEATURES 10절 "공개 예제부터").
    Optional<Job> load(long id) {
        record Head(long versionId, Language language, String sourceCode, boolean sampleOnly, int timeLimitMs,
                int memoryLimitMb) {
        }
        return jdbc.sql("select s.problem_version_id, s.language, s.source_code, s.submission_kind,"
                + " c.time_limit_ms, c.memory_limit_mb"
                + " from submissions s join problem_language_configs c"
                + "   on c.problem_version_id = s.problem_version_id and c.language = s.language"
                + " where s.id = :id")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("problem_version_id"), Language.valueOf(rs.getString("language")),
                        rs.getString("source_code"), "SAMPLE_RUN".equals(rs.getString("submission_kind")),
                        rs.getInt("time_limit_ms"), rs.getInt("memory_limit_mb")))
                .optional()
                .map(h -> new Job(id, h.versionId(), h.language(), h.sourceCode(), h.timeLimitMs(), h.memoryLimitMb(),
                        findCases(id, h.versionId(), h.sampleOnly())));
    }

    private List<CaseRow> findCases(long submissionId, long versionId, boolean sampleOnly) {
        return jdbc.sql("select t.id, t.case_type, t.input_data, t.expected_output, r.id as result_id, r.judge_token,"
                + " r.verdict, r.runtime_error_type, r.execution_time_ms, r.memory_used_kb,"
                + " coalesce(r.internal_error_retried, false) as retried"
                + " from test_cases t left join submission_test_results r"
                + "   on r.test_case_id = t.id and r.submission_id = :submissionId"
                + " where t.problem_version_id = :versionId and (not :sampleOnly or t.case_type = 'SAMPLE')"
                + " order by case when t.case_type = 'SAMPLE' then 0 else 1 end, t.ordinal")
                .param("submissionId", submissionId)
                .param("versionId", versionId)
                .param("sampleOnly", sampleOnly)
                .query((rs, n) -> new CaseRow(rs.getLong("id"), "SAMPLE".equals(rs.getString("case_type")),
                        rs.getString("input_data"), rs.getString("expected_output"), rs.getObject("result_id", Long.class),
                        rs.getString("judge_token"), enumOrNull(Verdict.class, rs.getString("verdict")),
                        enumOrNull(RuntimeErrorType.class, rs.getString("runtime_error_type")),
                        rs.getObject("execution_time_ms", Integer.class), rs.getObject("memory_used_kb", Integer.class),
                        rs.getBoolean("retried")))
                .list();
    }

    // 채점 서버에 보내기 전에 판정 없는 행을 만든다. 보낸 뒤 끊기면 토큰이 빈 행이 남아 재시작 때 알아볼 수 있다.
    // 묶음(최대 20개)을 한 문장으로 넣는다.
    void insertCaseRows(long submissionId, long versionId, List<Long> testCaseIds) {
        jdbc.sql("insert into submission_test_results (submission_id, problem_version_id, test_case_id)"
                + " select :submissionId, :versionId, t.id from test_cases t where t.id in (:testCaseIds)")
                .param("submissionId", submissionId)
                .param("versionId", versionId)
                .param("testCaseIds", testCaseIds)
                .update();
    }

    void saveToken(long submissionId, long testCaseId, String token) {
        jdbc.sql("update submission_test_results set judge_token = :token"
                + " where submission_id = :submissionId and test_case_id = :testCaseId")
                .param("token", token)
                .param("submissionId", submissionId)
                .param("testCaseId", testCaseId)
                .update();
    }

    // status 13으로 이 케이스를 다시 보낸다는 표시. 보내기 전에 남겨, 재시작해도 한 번만 다시 보낸다.
    void markRetried(long submissionId, long testCaseId) {
        jdbc.sql("update submission_test_results set internal_error_retried = true"
                + " where submission_id = :submissionId and test_case_id = :testCaseId")
                .param("submissionId", submissionId)
                .param("testCaseId", testCaseId)
                .update();
    }

    // stdout·stderr는 SAMPLE 케이스에만 넘긴다. 비공개 케이스의 출력 원문은 저장하지 않는다.
    void saveCaseResult(long submissionId, long testCaseId, CaseOutcome.Judged judged, String stdout, String stderr) {
        jdbc.sql("update submission_test_results set verdict = :verdict, runtime_error_type = :errorType,"
                + " execution_time_ms = :timeMs, memory_used_kb = :memoryKb, stdout = :stdout, stderr = :stderr"
                + " where submission_id = :submissionId and test_case_id = :testCaseId and verdict is null")
                .param("verdict", judged.verdict().name())
                .param("errorType", judged.errorType() == null ? null : judged.errorType().name())
                .param("timeMs", judged.timeMs())
                .param("memoryKb", judged.memoryKb())
                .param("stdout", stdout)
                .param("stderr", stderr)
                .param("submissionId", submissionId)
                .param("testCaseId", testCaseId)
                .update();
    }

    void markRunning(long id, int progress) {
        jdbc.sql("update submissions set job_status = 'RUNNING', progress = :progress where id = :id and job_status in " + ACTIVE)
                .param("progress", progress)
                .param("id", id)
                .update();
    }

    // 판정을 기록하고, 이 갱신으로 COMPLETED가 됐을 때만 풀이 통계를 올리고 정답 코드 검증을 반영한다(#35).
    // 두 번 부르면 시도 횟수가 두 번 오른다.
    @Transactional
    void complete(long id, Verdict verdict, RuntimeErrorType errorType, String compilerMessage, Integer timeMs,
            Integer memoryKb) {
        int updated = jdbc.sql("update submissions set job_status = 'COMPLETED', progress = 100, verdict = :verdict,"
                + " runtime_error_type = :errorType, compiler_message = :compilerMessage, execution_time_ms = :timeMs,"
                + " memory_used_kb = :memoryKb, judged_at = now() where id = :id and job_status in " + ACTIVE)
                .param("verdict", verdict.name())
                .param("errorType", errorType == null ? null : errorType.name())
                .param("compilerMessage", compilerMessage)
                .param("timeMs", timeMs)
                .param("memoryKb", memoryKb)
                .param("id", id)
                .update();
        if (updated == 1) {
            stats.recordJudged(id);
            validations.recordJudged(id);
        }
    }

    // 채점 불가. 판정이 빈 케이스가 남아도 진행률은 100으로 둔다(judge-verdict-mapping.md 제출 판정 합치기 6번).
    // 정답 코드 검증이면 채점 불가로 끝나도 버전의 검증 중 잠금을 풀어야 한다(#35).
    @Transactional
    void fail(long id) {
        int updated = jdbc.sql("update submissions set job_status = 'JUDGE_ERROR', progress = 100, judged_at = now()"
                + " where id = :id and job_status in " + ACTIVE)
                .param("id", id)
                .update();
        if (updated == 1) {
            validations.recordJudged(id);
        }
    }

    private static <E extends Enum<E>> E enumOrNull(Class<E> type, String name) {
        return name == null ? null : Enum.valueOf(type, name);
    }
}
