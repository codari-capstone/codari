package com.codingmon.api.submission;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import com.codingmon.api.Language;

// 제출 저장. 예제 실행(SAMPLE_RUN, #28)도 같은 버전 조회와 저장을 쓴다.
// 정답 코드 검증(VALIDATION, #35)은 reference_solution_id가 있어야 해서 그때 저장 함수를 더한다.
@Repository
class SubmissionRepository {

    enum Kind { SAMPLE_RUN, SUBMIT }

    record PublishedVersion(long id, boolean supportsLanguage) {
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
}
