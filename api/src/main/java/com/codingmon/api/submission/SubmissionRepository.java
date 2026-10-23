package com.codingmon.api.submission;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import com.codingmon.api.Language;

// 제출 저장과 결과 조회. 예제 실행(SAMPLE_RUN, #28)도 같은 버전 조회와 저장을 쓴다.
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

    // Judge0 실행 스크립트가 남기는 줄. 내부 경로가 들어 있다(judge-verdict-mapping.md 7절).
    private static final Pattern JUDGE_RUN_LINE = Pattern.compile("^run: line \\d+:");

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
        String cleaned = stderr.lines().filter(line -> !JUDGE_RUN_LINE.matcher(line).find())
                .collect(Collectors.joining("\n")).stripTrailing();
        return cleaned.isBlank() ? null : cleaned;
    }

    private static Instant instant(OffsetDateTime time) {
        return time == null ? null : time.toInstant();
    }
}
