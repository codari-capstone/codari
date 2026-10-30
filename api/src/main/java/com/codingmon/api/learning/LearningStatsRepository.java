package com.codingmon.api.learning;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

// 개념 태그별 학습 통계(LEARNING-001·002, REP-01·02). 식과 규칙은 docs/AI_FEATURES.md 7절이 기준이다.
// 리포트(#85)와 추천(#44)도 이 값을 쓴다.
@Repository
public class LearningStatsRepository {

    static final int REQUIRED_SOLVED_PROBLEMS = 5;

    private final JdbcClient jdbc;

    LearningStatsRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public record LearningStats(int solvedProblemCount, int requiredProblemCount, int remainingProblemCount,
            List<ConceptStat> concepts) {
    }

    public record ConceptStat(String slug, String name, int problemCount, int solvedCount, BigDecimal solveRate,
            BigDecimal averageAttempts, BigDecimal averageHintLevel, BigDecimal weaknessScore, boolean weak) {
    }

    private static final Comparator<ConceptStat> WEAKEST_FIRST = Comparator
            .comparing(ConceptStat::weaknessScore).reversed()
            .thenComparing(Comparator.comparingInt(ConceptStat::problemCount).reversed())
            .thenComparing(ConceptStat::slug);

    // 맞힌 문제 수와 개념별 통계가 같은 시점을 보게 묶는다. 그 사이에 채점이 끝나도 두 값이 어긋나지 않는다.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public LearningStats find(long userId) {
        int solved = jdbc.sql("select count(*) from user_problem_stats where user_id = :userId and solved")
                .param("userId", userId).query(Integer.class).single();
        int remaining = Math.max(REQUIRED_SOLVED_PROBLEMS - solved, 0);
        if (remaining > 0) {
            return new LearningStats(solved, REQUIRED_SOLVED_PROBLEMS, remaining, List.of());
        }
        // numeric으로 계산해 0.485가 0.48499…로 바뀌지 않게 하고, round()는 사사오입이다.
        // 취약 점수는 반올림한 세 지표로 계산해 화면 숫자로 다시 계산해도 같게 한다.
        // 공개가 내려간 문제는 마지막으로 공개됐던 버전의 태그로 센다.
        List<ConceptStat> rows = jdbc.sql("""
                with p as (
                  select s.solved, s.attempt_count, s.max_revealed_hint_level as hint,
                         (select v.id from problem_versions v
                           where v.problem_id = s.problem_id and v.published_at is not null
                           order by v.published_at desc limit 1) as version_id
                  from user_problem_stats s where s.user_id = :userId
                ), t as (
                  select c.slug, c.name, count(*) as problem_count,
                         count(*) filter (where p.solved) as solved_count,
                         round(count(*) filter (where p.solved)::numeric / count(*), 2) as solve_rate,
                         round(avg(p.attempt_count), 2) as average_attempts,
                         round(avg(p.hint), 2) as average_hint_level
                  from p join problem_version_tags pt on pt.problem_version_id = p.version_id
                         join concept_tags c on c.id = pt.concept_tag_id
                  group by c.id
                )
                select t.*, round(0.5 * (1 - solve_rate) + 0.3 * average_hint_level / 3
                    + 0.2 * least(average_attempts - 1, 4) / 4, 2) as weakness_score
                from t
                """)
                .param("userId", userId)
                .query((rs, n) -> new ConceptStat(rs.getString("slug"), rs.getString("name"),
                        rs.getInt("problem_count"), rs.getInt("solved_count"), rs.getBigDecimal("solve_rate"),
                        rs.getBigDecimal("average_attempts"), rs.getBigDecimal("average_hint_level"),
                        rs.getBigDecimal("weakness_score"), false))
                .list();
        List<ConceptStat> concepts = new ArrayList<>(rows);
        concepts.sort(WEAKEST_FIRST);
        // 취약 개념은 상위 2개 중 0점이 아닌 태그다.
        for (int i = 0; i < Math.min(2, concepts.size()); i++) {
            ConceptStat c = concepts.get(i);
            if (c.weaknessScore().signum() > 0) {
                concepts.set(i, new ConceptStat(c.slug(), c.name(), c.problemCount(), c.solvedCount(), c.solveRate(),
                        c.averageAttempts(), c.averageHintLevel(), c.weaknessScore(), true));
            }
        }
        return new LearningStats(solved, REQUIRED_SOLVED_PROBLEMS, 0, concepts);
    }
}
