package com.codingmon.api.submission;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import com.codingmon.api.Language;
import com.codingmon.api.judge.StoredText;

// 제출 저장과 결과 조회. 예제 실행(SAMPLE_RUN, #28)도 같은 버전 조회와 저장을 쓰고, 결과는 findSampleRun으로 읽는다.
// 정답 코드 검증(VALIDATION, #35)은 reference_solution_id가 있어야 해서 그때 저장 함수를 더한다.
@Repository
class SubmissionRepository {

    enum Kind { SAMPLE_RUN, SUBMIT }

    record PublishedVersion(long id, boolean supportsLanguage) {
    }

    // 채점 결과 화면(RES-01~06). 비공개 케이스의 입력·출력과 몇 번째 케이스인지는 담지 않는다(AI_FEATURES 원칙 1).
    // 판정·런타임 에러 종류의 쉬운 설명은 화면이 가진다(AI_FEATURES 10절).
    record SubmissionResult(long id, long problemId, String problemTitle, Language language, String status,
            int progress, String verdict, String runtimeErrorType, String runtimeErrorMessage, String compilerMessage,
            Integer executionTimeMs, Integer memoryUsedKb, Instant submittedAt, Instant judgedAt) {
    }

    // 예제 실행 결과(SOLVE-08). 예제의 입력·기대 출력은 화면이 문제 상세에서 받은 것을 ordinal로 짝짓는다.
    record SampleRunResult(long id, long problemId, Language language, String status, int progress, String verdict,
            String runtimeErrorType, String compilerMessage, Instant submittedAt, Instant judgedAt,
            List<SampleCaseResult> cases) {
    }

    // 공개 예제라 출력과 에러 원문을 그대로 준다(RES-04). 아직 실행 전이면 결과 값은 null이다.
    record SampleCaseResult(int ordinal, String actualOutput, String verdict, String errorMessage,
            Integer executionTimeMs, Integer memoryUsedKb) {
    }

    private final JdbcClient jdbc;

    SubmissionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // 문제의 공개 버전과, 그 버전이 이 언어를 지원하는지. 공개 버전이 없으면 비어 있다.
    Optional<PublishedVersion> findPublishedVersion(long problemId, Language language) {
        return jdbc.sql("select v.id, exists (select 1 from problem_language_configs c"
                + " where c.problem_version_id = v.id and c.language = :language) as supports_language"
                + " from problem_versions v where v.problem_id = :problemId and v.status = 'PUBLISHED'")
                .param("problemId", problemId)
                .param("language", language.name())
                .query((rs, n) -> new PublishedVersion(rs.getLong("id"), rs.getBoolean("supports_language")))
                .optional();
    }

    // 본인의 SUBMIT 제출만 찾는다. 남의 제출도 비어 있게 답해 그 번호의 제출이 있는지 드러내지 않는다.
    // 케이스는 SAMPLE부터 ordinal 순으로 채점하고 처음 틀린 케이스가 판정을 낸다(judge-verdict-mapping.md 제출 판정 합치기).
    // 그래서 틀린 SAMPLE 케이스가 있으면 그게 판정을 낸 케이스고, 런타임 에러면 그 원문을 보여 준다(RES-04).
    Optional<SubmissionResult> findResult(long userId, long submissionId) {
        return jdbc.sql("select s.id, v.problem_id, v.title, s.language, s.job_status, s.progress, s.verdict,"
                + " s.runtime_error_type, s.compiler_message, s.execution_time_ms, s.memory_used_kb, s.submitted_at, s.judged_at,"
                + " case when s.verdict = 'RUNTIME_ERROR' then (select case when r.verdict = 'RUNTIME_ERROR' then r.stderr end"
                + "   from submission_test_results r join test_cases c on c.id = r.test_case_id"
                + "   where r.submission_id = s.id and c.case_type = 'SAMPLE' and r.verdict <> 'ACCEPTED'"
                + "   order by c.ordinal limit 1) end as sample_stderr"
                + " from submissions s join problem_versions v on v.id = s.problem_version_id"
                + " where s.id = :id and s.user_id = :userId and s.submission_kind = 'SUBMIT'")
                .param("id", submissionId)
                .param("userId", userId)
                .query((rs, n) -> new SubmissionResult(rs.getLong("id"), rs.getLong("problem_id"), rs.getString("title"),
                        Language.valueOf(rs.getString("language")), rs.getString("job_status"), rs.getInt("progress"),
                        rs.getString("verdict"), rs.getString("runtime_error_type"), cleanStderr(rs.getString("sample_stderr")),
                        rs.getString("compiler_message"), rs.getObject("execution_time_ms", Integer.class),
                        rs.getObject("memory_used_kb", Integer.class), instant(rs.getObject("submitted_at", OffsetDateTime.class)),
                        instant(rs.getObject("judged_at", OffsetDateTime.class))))
                .optional();
    }

    // 본인의 SAMPLE_RUN만 찾는다. 남의 것도 비어 있게 답한다(findResult와 같다).
    // 행을 읽는 중에 예제 결과를 조회하므로 한 연결에서 돌게 묶고, 처리기가 그 사이 결과를 써도 상태와 cases가 같은 시점을 보게 한다.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    Optional<SampleRunResult> findSampleRun(long userId, long submissionId) {
        return jdbc.sql("select s.id, v.problem_id, s.language, s.job_status, s.progress, s.verdict, s.runtime_error_type,"
                + " s.compiler_message, s.submitted_at, s.judged_at"
                + " from submissions s join problem_versions v on v.id = s.problem_version_id"
                + " where s.id = :id and s.user_id = :userId and s.submission_kind = 'SAMPLE_RUN'")
                .param("id", submissionId)
                .param("userId", userId)
                .query((rs, n) -> new SampleRunResult(rs.getLong("id"), rs.getLong("problem_id"),
                        Language.valueOf(rs.getString("language")), rs.getString("job_status"), rs.getInt("progress"),
                        rs.getString("verdict"), rs.getString("runtime_error_type"), rs.getString("compiler_message"),
                        instant(rs.getObject("submitted_at", OffsetDateTime.class)),
                        instant(rs.getObject("judged_at", OffsetDateTime.class)), findSampleCases(submissionId)))
                .optional();
    }

    // 그 버전의 SAMPLE 케이스 전부에 결과를 붙인다. ordinal은 문제 상세 samples와 같은 순서의 1부터 번호다
    // (test_cases.ordinal은 HIDDEN과 함께 매긴 번호라 그대로 주면 화면이 짝지을 수 없다).
    private List<SampleCaseResult> findSampleCases(long submissionId) {
        return jdbc.sql("select row_number() over (order by c.ordinal) as ordinal, r.stdout, r.verdict, r.stderr,"
                + " r.execution_time_ms, r.memory_used_kb"
                + " from submissions s join test_cases c on c.problem_version_id = s.problem_version_id and c.case_type = 'SAMPLE'"
                + " left join submission_test_results r on r.submission_id = s.id and r.test_case_id = c.id"
                + " where s.id = :id order by c.ordinal")
                .param("id", submissionId)
                .query((rs, n) -> new SampleCaseResult(rs.getInt("ordinal"), rs.getString("stdout"), rs.getString("verdict"),
                        cleanStderr(rs.getString("stderr")), rs.getObject("execution_time_ms", Integer.class),
                        rs.getObject("memory_used_kb", Integer.class)))
                .list();
    }

    // QUEUED로 저장한다. 이후 상태는 채점 처리기(#71)가 갱신한다.
    long insertQueued(long userId, long versionId, Kind kind, Language language, String source) {
        return jdbc.sql("insert into submissions (user_id, problem_version_id, submission_kind, language, source_code)"
                + " values (:userId, :versionId, :kind, :language, :source) returning id")
                .param("userId", userId)
                .param("versionId", versionId)
                .param("kind", kind.name())
                .param("language", language.name())
                .param("source", source)
                .query(Long.class)
                .single();
    }

    // C++ Segfault처럼 Judge0 줄만 남으면 비운다. 화면은 종류만 보여 준다.
    private static String cleanStderr(String stderr) {
        if (stderr == null) {
            return null;
        }
        String cleaned = StoredText.withoutJudgeLines(stderr);
        return cleaned.isBlank() ? null : cleaned;
    }

    private static Instant instant(OffsetDateTime time) {
        return time == null ? null : time.toInstant();
    }
}
