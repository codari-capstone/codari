package com.codingmon.api.problem;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import com.codingmon.api.Language;
import com.fasterxml.jackson.annotation.JsonInclude;

// 사용자 화면용 문제 조회. 공개(PUBLISHED) 버전만 보고, 제목·난이도·태그는 그 버전에서 읽는다.
// 읽기만 하고 여러 테이블을 묶어 보므로 JPA 엔티티 없이 SQL로 쓴다.
@Repository
class ProblemRepository {

    enum Difficulty { EASY, MEDIUM, HARD }

    enum SolveStatus { SOLVED, WRONG, UNSOLVED }

    enum SortField { ID, DIFFICULTY }

    record ConceptTag(String slug, String name) {
    }

    // 비로그인이면 solveStatus를 아예 싣지 않는다. 비로그인(모름)과 UNSOLVED(안 품)는 다른 뜻이다.
    record ProblemSummary(Long id, String slug, String title, Difficulty difficulty, List<ConceptTag> tags,
            @JsonInclude(JsonInclude.Include.NON_NULL) SolveStatus solveStatus) {
    }

    record Page<T>(List<T> content, long totalElements) {
    }

    record Sample(String input, String output) {
    }

    record LanguageConfig(Language language, int timeLimitMs, int memoryLimitMb, String starterCode) {
    }

    // 비공개 케이스와 정답 코드는 담지 않는다(database-tables.md의 test_cases·reference_solutions).
    record PublishedProblem(Long id, String slug, int versionNo, String title, Difficulty difficulty,
            List<ConceptTag> tags, String statementMarkdown, String inputDescription, String outputDescription,
            String constraintsMarkdown, String sourceName, String sourceUrl, String license,
            List<Sample> samples, List<LanguageConfig> languages) {
    }

    record ListQuery(Long userId, String keyword, List<Difficulty> difficulties, List<String> tags,
            List<SolveStatus> statuses, SortField sortField, boolean ascending, int page, int size) {
    }

    // LIST-01: user_problem_stats는 판정이 확정된 SUBMIT 제출로만 쌓인다(database-tables.md).
    // 행이 없으면 안 품, 있으면 solved로 맞음·틀림을 가른다.
    private static final String SOLVE_STATUS = "case when s.solved then 'SOLVED'"
            + " when s.user_id is not null then 'WRONG' else 'UNSOLVED' end";

    // 문자열 순서(EASY, HARD, MEDIUM)가 아니라 쉬운 순서로 정렬한다.
    private static final String DIFFICULTY_RANK = "case v.difficulty when 'EASY' then 0 when 'MEDIUM' then 1 else 2 end";

    private final JdbcClient jdbc;

    ProblemRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // count·목록·태그 쿼리가 같은 시점을 보게 묶는다. READ COMMITTED면 쿼리마다 시점이 달라 totalElements와 content가 어긋날 수 있다.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    Page<ProblemSummary> findPublished(ListQuery query) {
        boolean signedIn = query.userId() != null;
        Map<String, Object> params = new HashMap<>();
        StringBuilder from = new StringBuilder(
                " from problems p join problem_versions v on v.problem_id = p.id and v.status = 'PUBLISHED'");
        if (signedIn) {
            from.append(" left join user_problem_stats s on s.problem_id = p.id and s.user_id = :userId");
            params.put("userId", query.userId());
        }
        from.append(" where true");
        if (query.keyword() != null) {
            from.append(" and v.title ilike :keyword escape '\\'");
            params.put("keyword", "%" + escapeLike(query.keyword()) + "%");
        }
        if (!query.difficulties().isEmpty()) {
            from.append(" and v.difficulty in (:difficulties)");
            params.put("difficulties", query.difficulties().stream().map(Enum::name).toList());
        }
        // 태그를 여러 개 고르면 그중 하나라도 달린 문제를 보여 준다.
        if (!query.tags().isEmpty()) {
            from.append(" and exists (select 1 from problem_version_tags pvt join concept_tags t on t.id = pvt.concept_tag_id"
                    + " where pvt.problem_version_id = v.id and t.slug in (:tags))");
            params.put("tags", query.tags());
        }
        // 비로그인 요청의 status는 무시한다. 공유된 링크를 연 비로그인 사용자에게 오류 대신 전체 목록을 보여 준다.
        if (signedIn && !query.statuses().isEmpty()) {
            from.append(" and (").append(SOLVE_STATUS).append(") in (:statuses)");
            params.put("statuses", query.statuses().stream().map(Enum::name).toList());
        }

        long total = jdbc.sql("select count(*)" + from).params(params).query(Long.class).single();

        String direction = query.ascending() ? " asc" : " desc";
        StringBuilder sql = new StringBuilder("select p.id, p.slug, v.id as version_id, v.title, v.difficulty, ")
                .append(signedIn ? SOLVE_STATUS : "null").append(" as solve_status")
                .append(from)
                .append(" order by ")
                .append(query.sortField() == SortField.DIFFICULTY ? DIFFICULTY_RANK + direction + ", p.id asc" : "p.id" + direction)
                .append(" limit :limit offset :offset");
        params.put("limit", query.size());
        params.put("offset", (long) query.page() * query.size());

        Map<Long, Row> rows = new LinkedHashMap<>();
        jdbc.sql(sql.toString()).params(params).query(rs -> {
            String status = rs.getString("solve_status");
            rows.put(rs.getLong("version_id"), new Row(rs.getLong("id"), rs.getString("slug"), rs.getString("title"),
                    Difficulty.valueOf(rs.getString("difficulty")), status == null ? null : SolveStatus.valueOf(status)));
        });

        Map<Long, List<ConceptTag>> tags = tagsOf(rows.keySet());
        List<ProblemSummary> content = rows.entrySet().stream()
                .map(e -> e.getValue().toSummary(tags.getOrDefault(e.getKey(), List.of())))
                .toList();
        return new Page<>(content, total);
    }

    // 행을 읽는 중에 태그·예제·언어를 조회하므로 한 연결에서 돌게 묶는다.
    @Transactional(readOnly = true)
    Optional<PublishedProblem> findPublished(long problemId) {
        return jdbc.sql("select p.id, p.slug, v.id as version_id, v.version_no, v.title, v.difficulty, v.statement_markdown,"
                + " v.input_description, v.output_description, v.constraints_markdown, v.source_name, v.source_url, v.license"
                + " from problems p join problem_versions v on v.problem_id = p.id and v.status = 'PUBLISHED'"
                + " where p.id = :id")
                .param("id", problemId)
                .query((rs, n) -> {
                    long versionId = rs.getLong("version_id");
                    return new PublishedProblem(rs.getLong("id"), rs.getString("slug"), rs.getInt("version_no"),
                            rs.getString("title"), Difficulty.valueOf(rs.getString("difficulty")),
                            tagsOf(List.of(versionId)).getOrDefault(versionId, List.of()),
                            rs.getString("statement_markdown"), rs.getString("input_description"),
                            rs.getString("output_description"), rs.getString("constraints_markdown"),
                            rs.getString("source_name"), rs.getString("source_url"), rs.getString("license"),
                            samplesOf(versionId), languagesOf(versionId));
                })
                .optional();
    }

    private List<Sample> samplesOf(long versionId) {
        return jdbc.sql("select input_data, expected_output from test_cases"
                + " where problem_version_id = :id and case_type = 'SAMPLE' order by ordinal")
                .param("id", versionId)
                .query((rs, n) -> new Sample(rs.getString("input_data"), rs.getString("expected_output")))
                .list();
    }

    // 화면의 언어 선택 순서(Python → C++)대로 준다.
    private List<LanguageConfig> languagesOf(long versionId) {
        return jdbc.sql("select language, time_limit_ms, memory_limit_mb, starter_code from problem_language_configs"
                + " where problem_version_id = :id order by case language when 'PYTHON' then 0 else 1 end")
                .param("id", versionId)
                .query((rs, n) -> new LanguageConfig(Language.valueOf(rs.getString("language")),
                        rs.getInt("time_limit_ms"), rs.getInt("memory_limit_mb"), rs.getString("starter_code")))
                .list();
    }

    List<ConceptTag> findAllTags() {
        return jdbc.sql("select slug, name from concept_tags order by id")
                .query((rs, n) -> new ConceptTag(rs.getString("slug"), rs.getString("name")))
                .list();
    }

    private Map<Long, List<ConceptTag>> tagsOf(Collection<Long> versionIds) {
        Map<Long, List<ConceptTag>> tags = new HashMap<>();
        if (versionIds.isEmpty()) {
            return tags;
        }
        jdbc.sql("select pvt.problem_version_id, t.slug, t.name from problem_version_tags pvt"
                + " join concept_tags t on t.id = pvt.concept_tag_id"
                + " where pvt.problem_version_id in (:ids) order by t.id")
                .param("ids", versionIds)
                .query(rs -> {
                    tags.computeIfAbsent(rs.getLong("problem_version_id"), id -> new ArrayList<>())
                            .add(new ConceptTag(rs.getString("slug"), rs.getString("name")));
                });
        return tags;
    }

    // 사용자가 입력한 %·_는 와일드카드가 아니라 글자로 찾는다.
    static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private record Row(Long id, String slug, String title, Difficulty difficulty, SolveStatus solveStatus) {
        ProblemSummary toSummary(List<ConceptTag> tags) {
            return new ProblemSummary(id, slug, title, difficulty, tags, solveStatus);
        }
    }
}
