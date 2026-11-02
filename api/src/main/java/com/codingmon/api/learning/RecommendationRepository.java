package com.codingmon.api.learning;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import com.codingmon.api.learning.LearningStatsRepository.LearningStats;

// 다음 문제 추천(LEARNING-003). 규칙은 docs/AI_FEATURES.md 7절이 기준이다.
// 리포트(#85)가 저장하는 통계를 그대로 받아, 리포트 문장과 같은 취약 개념으로 고른다.
@Repository
public class RecommendationRepository {

    static final int RECOMMENDATION_COUNT = 3;

    private static final List<String> CHALLENGE_ORDER = List.of("MEDIUM", "HARD", "EASY");

    private final JdbcClient jdbc;

    RecommendationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // conceptTagId가 null이면 취약 개념이 아니라 난이도로 고른 도전 문제다.
    public record Recommendation(int rank, long problemId, Long conceptTagId) {
    }

    private record Candidate(long problemId, String difficulty, Long tagId, String slug) {
    }

    public List<Recommendation> recommend(long userId, LearningStats stats) {
        // 공개 중이고 아직 맞히지 않은 문제를 태그마다 한 줄씩, 쉬운 순·문제 번호 순으로 읽는다. 틀린 문제도 넣는다.
        List<Candidate> rows = jdbc.sql("""
                select v.problem_id, v.difficulty, c.id as tag_id, c.slug
                from problem_versions v
                left join problem_version_tags pt on pt.problem_version_id = v.id
                left join concept_tags c on c.id = pt.concept_tag_id
                where v.status = 'PUBLISHED'
                  and not exists (select 1 from user_problem_stats s
                                  where s.user_id = :userId and s.problem_id = v.problem_id and s.solved)
                order by case v.difficulty when 'EASY' then 0 when 'MEDIUM' then 1 else 2 end, v.problem_id
                """)
                .param("userId", userId)
                .query((rs, n) -> new Candidate(rs.getLong("problem_id"), rs.getString("difficulty"),
                        rs.getObject("tag_id", Long.class), rs.getString("slug")))
                .list();
        // stats.concepts()는 취약 점수가 높은 순이다. 0점 태그는 근거가 되지 않는다.
        List<List<Candidate>> tags = stats.concepts().stream()
                .filter(c -> c.weaknessScore().signum() > 0)
                .map(c -> rows.stream().filter(r -> c.slug().equals(r.slug())).toList())
                .toList();

        // 문제 번호 → 근거 태그. 태그가 여러 개인 문제는 먼저 담은 태그로 한 번만 담는다.
        Map<Long, Long> picked = new LinkedHashMap<>();
        // 1위 2개·2위 1개, 남으면 1위·2위의 나머지, 그다음 3위 이하 태그 순서로 채운다.
        if (tags.size() > 0) {
            take(picked, tags.get(0), 2);
        }
        if (tags.size() > 1) {
            take(picked, tags.get(1), 1);
        }
        for (List<Candidate> tag : tags) {
            take(picked, tag, RECOMMENDATION_COUNT);
        }
        // 그래도 남으면 태그와 관계없이 한 단계 위인 MEDIUM부터 도전 문제로 채운다. 정렬이 안정적이라 문제 번호 순은 유지된다.
        List<Candidate> challenge = rows.stream()
                .sorted(Comparator.comparingInt(r -> CHALLENGE_ORDER.indexOf(r.difficulty())))
                .map(r -> new Candidate(r.problemId(), r.difficulty(), null, null))
                .toList();
        take(picked, challenge, RECOMMENDATION_COUNT);

        List<Recommendation> result = new ArrayList<>();
        picked.forEach((problemId, tagId) -> result.add(new Recommendation(result.size() + 1, problemId, tagId)));
        return result;
    }

    private static void take(Map<Long, Long> picked, List<Candidate> from, int max) {
        int taken = 0;
        for (Candidate c : from) {
            if (picked.size() == RECOMMENDATION_COUNT || taken == max) {
                return;
            }
            if (!picked.containsKey(c.problemId())) {
                picked.put(c.problemId(), c.tagId());
                taken++;
            }
        }
    }
}
