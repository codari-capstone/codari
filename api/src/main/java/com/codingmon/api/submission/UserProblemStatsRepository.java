package com.codingmon.api.submission;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 문제별 풀이 통계(user_problem_stats). 문제 목록의 풀이 상태(LIST-01)와 취약 개념·추천이 이 값을 쓴다.
@Repository
public class UserProblemStatsRepository {

    private final JdbcClient jdbc;

    UserProblemStatsRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // 채점 처리기(#71)가 SUBMIT 제출을 COMPLETED로 바꾸는 트랜잭션 안에서 제출마다 한 번 부른다.
    // 두 번 부르면 시도 횟수가 두 번 올라가므로, COMPLETED로 바뀐 그 갱신에서만 부른다.
    // 정답 이후 제출은 세지 않는다(database-tables.md). SAMPLE_RUN·VALIDATION·채점 불가·채점 중이면 아무것도 하지 않는다.
    // ponytail: 판정이 확정된 순서대로 센다. 슬롯 2개에서 늦게 낸 정답이 먼저 끝나면 먼저 낸 오답은 정답 뒤로 보고 세지 않는다.
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordJudged(long submissionId) {
        jdbc.sql("insert into user_problem_stats (user_id, problem_id, solved, first_solved_at, attempt_count)"
                + " select s.user_id, v.problem_id, s.verdict = 'ACCEPTED',"
                + "   case when s.verdict = 'ACCEPTED' then coalesce(s.judged_at, now()) end, 1"
                + " from submissions s join problem_versions v on v.id = s.problem_version_id"
                + " where s.id = :id and s.submission_kind = 'SUBMIT' and s.job_status = 'COMPLETED'"
                + " on conflict (user_id, problem_id) do update set"
                + "   solved = excluded.solved, first_solved_at = excluded.first_solved_at,"
                + "   attempt_count = user_problem_stats.attempt_count + 1, updated_at = now()"
                + " where not user_problem_stats.solved")
                .param("id", submissionId)
                .update();
    }
}
