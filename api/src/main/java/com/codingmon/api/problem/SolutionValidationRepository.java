package com.codingmon.api.problem;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 정답 코드 검증(VALIDATION, #35)이 끝났을 때의 반영. 채점 처리기가 제출을 끝내는 트랜잭션 안에서 부른다.
@Repository
public class SolutionValidationRepository {

    private final JdbcClient jdbc;

    SolutionValidationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // 채점 처리기(#71)가 제출을 COMPLETED·JUDGE_ERROR로 바꾼 갱신에서 제출마다 한 번 부른다. VALIDATION이 아니면 아무것도 하지 않는다.
    // 모든 케이스를 통과했으면 그 정답 코드에 통과 표시를 하고, 그 버전에 진행 중인 검증이 없으면 VALIDATING을 푼다.
    // 두 표시를 한 트랜잭션에서 해야 "두 언어 통과인데 아직 검증 중"인 순간이 바깥에 보이지 않는다(openapi publishProblem).
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordJudged(long submissionId) {
        // 두 언어의 검증이 슬롯 2개에서 함께 끝나면 서로의 커밋 전 상태를 보고 둘 다 잠금을 풀지 않을 수 있다.
        // 문제 행을 잠가 차례로 보게 한다. 관리자 저장·공개·삭제도 같은 행을 잠근다(AdminProblemRepository.lockLatest).
        Long versionId = jdbc.sql("select s.problem_version_id from submissions s"
                + " join problem_versions v on v.id = s.problem_version_id join problems p on p.id = v.problem_id"
                + " where s.id = :id and s.submission_kind = 'VALIDATION' for update of p")
                .param("id", submissionId)
                .query(Long.class)
                .optional()
                .orElse(null);
        if (versionId == null) {
            return;
        }
        jdbc.sql("update reference_solutions r set verified_at = now() from submissions s"
                + " where s.id = :id and s.job_status = 'COMPLETED' and s.verdict = 'ACCEPTED' and r.id = s.reference_solution_id")
                .param("id", submissionId)
                .update();
        jdbc.sql("update problem_versions set status = 'DRAFT' where id = :versionId and status = 'VALIDATING'"
                + " and not exists (select 1 from submissions where problem_version_id = :versionId"
                + "   and submission_kind = 'VALIDATION' and job_status in ('QUEUED', 'COMPILING', 'RUNNING'))")
                .param("versionId", versionId)
                .update();
    }
}
