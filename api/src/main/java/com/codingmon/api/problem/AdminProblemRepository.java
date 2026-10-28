package com.codingmon.api.problem;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import com.codingmon.api.Language;
import com.codingmon.api.problem.ProblemRepository.Difficulty;
import com.codingmon.api.problem.ProblemRepository.Page;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonUnwrapped;

// 관리자 문제 관리(#33)와 테스트케이스·태그(#34). 버전 규칙은 #33·#34 본문 "정한 것"과 openapi `updateProblem`·`replaceTestCases` 설명을 따른다.
// 바꾸는 작업은 problems 행을 잠가 같은 문제의 저장·공개·삭제가 한 번에 하나씩 돌게 한다.
@Repository
class AdminProblemRepository {

    enum Status { DRAFT, VALIDATING, PUBLISHED, RETIRED }

    enum PublishCondition { SAMPLE_COUNT, HIDDEN_COUNT, TAG_COUNT, SOURCE, LANGUAGES }

    record LanguageInput(Language language, Integer timeLimitMs, Integer memoryLimitMb, String starterCode) {
    }

    record ProblemInput(String title, Difficulty difficulty, String statementMarkdown, String inputDescription,
            String outputDescription, String constraintsMarkdown, String sourceName, String sourceUrl, String license,
            List<String> tags, List<LanguageInput> languages) {
    }

    record Summary(long id, String slug, String title, Difficulty difficulty, int latestVersionNo, Status latestStatus,
            Integer publishedVersionNo) {
    }

    record VersionSummary(int versionNo, Status status, Instant createdAt, Instant publishedAt) {
    }

    record Version(@JsonIgnore long versionId, long id, String slug, int versionNo, Status status, Instant createdAt,
            Instant publishedAt, @JsonUnwrapped ProblemInput content) {
    }

    record Detail(@JsonUnwrapped Version version, Integer publishedVersionNo, List<PublishCondition> unmetConditions) {
    }

    record Saved(int versionNo, Status status) {
    }

    enum CaseType { SAMPLE, HIDDEN }

    record TestCaseInput(CaseType caseType, String input, String output) {
    }

    record TestCase(CaseType caseType, String input, String output, int inputBytes, int outputBytes) {
    }

    // 검증 중이거나 공개 조건이 깨져 저장하지 않은 경우. 컨트롤러가 409로 바꾼다.
    sealed interface SaveResult {
        record Ok(Saved saved) implements SaveResult {
        }

        record Validating() implements SaveResult {
        }

        record ConditionsBroken(List<PublishCondition> unmet) implements SaveResult {
        }
    }

    private record Row(long versionId, int versionNo, Status status) {
    }

    private static final String VERSION_COLUMNS = "p.id, p.slug, v.id as version_id, v.version_no, v.status, v.created_at,"
            + " v.published_at, v.title, v.difficulty, v.statement_markdown, v.input_description, v.output_description,"
            + " v.constraints_markdown, v.source_name, v.source_url, v.license";

    private final JdbcClient jdbc;

    AdminProblemRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // count와 목록이 같은 시점을 보게 묶는다(ProblemRepository.findPublished와 같다).
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    Page<Summary> list(String keyword, int page, int size) {
        String from = " from problems p"
                + " join lateral (select * from problem_versions where problem_id = p.id order by version_no desc limit 1) v on true"
                + (keyword == null ? "" : " where v.title ilike :keyword escape '\\'");
        Map<String, Object> params = new HashMap<>();
        if (keyword != null) {
            params.put("keyword", "%" + ProblemRepository.escapeLike(keyword) + "%");
        }
        long total = jdbc.sql("select count(*)" + from).params(params).query(Long.class).single();
        params.put("limit", size);
        params.put("offset", (long) page * size);
        List<Summary> content = jdbc.sql("select p.id, p.slug, v.title, v.difficulty, v.version_no, v.status,"
                + " (select version_no from problem_versions where problem_id = p.id and status = 'PUBLISHED') as published_no"
                + from + " order by p.id limit :limit offset :offset")
                .params(params)
                .query((rs, n) -> new Summary(rs.getLong("id"), rs.getString("slug"), rs.getString("title"),
                        Difficulty.valueOf(rs.getString("difficulty")), rs.getInt("version_no"),
                        Status.valueOf(rs.getString("status")), rs.getObject("published_no", Integer.class)))
                .list();
        return new Page<>(content, total);
    }

    // 버전 행을 읽는 중에 태그·언어·공개 조건을 조회하므로 한 연결에서 같은 시점을 보게 묶는다.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    Optional<Detail> detail(long problemId) {
        return version(problemId, null).map(v -> new Detail(v, publishedVersionNo(problemId), unmetConditions(v.versionId())));
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    Optional<Version> version(long problemId, Integer versionNo) {
        return jdbc.sql("select " + VERSION_COLUMNS + " from problems p join problem_versions v on v.problem_id = p.id"
                + " where p.id = :id" + (versionNo == null ? "" : " and v.version_no = :versionNo")
                + " order by v.version_no desc limit 1")
                .param("id", problemId)
                .param("versionNo", versionNo)
                .query((rs, n) -> {
                    long versionId = rs.getLong("version_id");
                    return new Version(versionId, rs.getLong("id"), rs.getString("slug"), rs.getInt("version_no"),
                            Status.valueOf(rs.getString("status")), instant(rs.getObject("created_at", OffsetDateTime.class)),
                            instant(rs.getObject("published_at", OffsetDateTime.class)),
                            new ProblemInput(rs.getString("title"), Difficulty.valueOf(rs.getString("difficulty")),
                                    rs.getString("statement_markdown"), rs.getString("input_description"),
                                    rs.getString("output_description"), rs.getString("constraints_markdown"),
                                    rs.getString("source_name"), rs.getString("source_url"), rs.getString("license"),
                                    tagsOf(versionId), languagesOf(versionId)));
                })
                .optional();
    }

    // 없는 문제면 비어 있다.
    Optional<List<VersionSummary>> versions(long problemId) {
        List<VersionSummary> versions = jdbc.sql("select version_no, status, created_at, published_at from problem_versions"
                + " where problem_id = :id order by version_no desc")
                .param("id", problemId)
                .query((rs, n) -> new VersionSummary(rs.getInt("version_no"), Status.valueOf(rs.getString("status")),
                        instant(rs.getObject("created_at", OffsetDateTime.class)),
                        instant(rs.getObject("published_at", OffsetDateTime.class))))
                .list();
        return versions.isEmpty() ? Optional.empty() : Optional.of(versions);
    }

    // slug별 태그 id. 없는 slug는 빠진다.
    Map<String, Long> tagIds(List<String> slugs) {
        if (slugs.isEmpty()) {
            return Map.of();
        }
        return jdbc.sql("select slug, id from concept_tags where slug in (:slugs)")
                .param("slugs", slugs)
                .query((rs, n) -> Map.entry(rs.getString("slug"), rs.getLong("id")))
                .list()
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    // slug는 문제 번호로 만든다. 번호는 INSERT 뒤에 정해지므로 임시 값으로 넣고 바로 바꾼다.
    @Transactional
    long create(ProblemInput input, List<Long> tagIds) {
        long problemId = jdbc.sql("insert into problems (slug) values (:slug) returning id")
                .param("slug", "tmp-" + UUID.randomUUID())
                .query(Long.class)
                .single();
        jdbc.sql("update problems set slug = 'p-' || id where id = :id").param("id", problemId).update();
        insertVersion(problemId, 1, input, tagIds);
        return problemId;
    }

    // 없는 문제면 비어 있다.
    @Transactional
    Optional<SaveResult> update(long problemId, ProblemInput input, List<Long> tagIds) {
        Optional<Row> found = lockLatest(problemId);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        Row latest = found.get();
        if (latest.status() == Status.VALIDATING) {
            return Optional.of(new SaveResult.Validating());
        }
        boolean sameLimits = limitsOf(latest.versionId()).equals(limitsOf(input.languages()));
        if (latest.status() == Status.DRAFT) {
            if (!sameLimits) {
                // 제한이 바뀌면 이전 검증은 의미가 없다(database-schema.md: 초안의 케이스·정답 코드가 바뀔 때와 같다).
                clearValidation(latest.versionId());
            }
            overwrite(latest.versionId(), input, tagIds);
            return Optional.of(new SaveResult.Ok(new Saved(latest.versionNo(), Status.DRAFT)));
        }
        if (sameLimits) {
            if (latest.status() == Status.PUBLISHED) {
                List<PublishCondition> broken = textConditions(input);
                if (!broken.isEmpty()) {
                    return Optional.of(new SaveResult.ConditionsBroken(broken));
                }
            }
            overwrite(latest.versionId(), input, tagIds);
            return Optional.of(new SaveResult.Ok(new Saved(latest.versionNo(), latest.status())));
        }
        // 채점 기준이 바뀐다. 공개 중인 버전은 그대로 두고 새 초안에 저장한다.
        overwrite(newDraft(latest), input, tagIds);
        return Optional.of(new SaveResult.Ok(new Saved(latest.versionNo() + 1, Status.DRAFT)));
    }

    // 없는 문제면 비어 있다. 최신 버전(detail과 같은 버전)의 케이스를 순서대로 준다.
    @Transactional(readOnly = true)
    Optional<List<TestCase>> testCases(long problemId) {
        return latestVersionId(problemId).map(versionId -> jdbc.sql("select case_type, input_data, expected_output,"
                + " octet_length(input_data) as input_bytes, octet_length(expected_output) as output_bytes"
                + " from test_cases where problem_version_id = :id order by ordinal")
                .param("id", versionId)
                .query((rs, n) -> new TestCase(CaseType.valueOf(rs.getString("case_type")), rs.getString("input_data"),
                        rs.getString("expected_output"), rs.getInt("input_bytes"), rs.getInt("output_bytes")))
                .list());
    }

    boolean exists(long problemId) {
        return latestVersionId(problemId).isPresent();
    }

    // 없는 문제면 비어 있다. 버전 규칙은 openapi `replaceTestCases` 설명을 따른다.
    @Transactional
    Optional<SaveResult> replaceTestCases(long problemId, List<TestCaseInput> cases) {
        Optional<Row> found = lockLatest(problemId);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        Row latest = found.get();
        if (latest.status() == Status.VALIDATING) {
            return Optional.of(new SaveResult.Validating());
        }
        if (casesOf(latest.versionId()).equals(cases)) {
            return Optional.of(new SaveResult.Ok(new Saved(latest.versionNo(), latest.status())));
        }
        long versionId;
        int versionNo;
        if (latest.status() == Status.DRAFT) {
            // 케이스가 바뀌면 이전 검증은 의미가 없다(database-schema.md).
            clearValidation(latest.versionId());
            versionId = latest.versionId();
            versionNo = latest.versionNo();
        } else {
            // 공개됐던 버전의 케이스는 사용자 제출 결과가 가리키므로 그대로 두고 새 초안에 저장한다.
            versionId = newDraft(latest);
            versionNo = latest.versionNo() + 1;
        }
        jdbc.sql("delete from test_cases where problem_version_id = :id").param("id", versionId).update();
        for (int i = 0; i < cases.size(); i++) {
            TestCaseInput testCase = cases.get(i);
            jdbc.sql("insert into test_cases (problem_version_id, ordinal, case_type, input_data, expected_output)"
                    + " values (:versionId, :ordinal, :type, :input, :output)")
                    .param("versionId", versionId)
                    .param("ordinal", i + 1)
                    .param("type", testCase.caseType().name())
                    .param("input", testCase.input())
                    .param("output", testCase.output())
                    .update();
        }
        return Optional.of(new SaveResult.Ok(new Saved(versionNo, Status.DRAFT)));
    }

    // 이름이나 slug가 이미 있으면 false. 두 유일 제약 중 어느 쪽에 걸려도 넣지 않는다.
    boolean createTag(String slug, String name) {
        return jdbc.sql("insert into concept_tags (slug, name) values (:slug, :name) on conflict do nothing")
                .param("slug", slug).param("name", name).update() == 1;
    }

    // 없는 문제면 비어 있다. 공개했거나 이미 공개 중이면 빈 목록을 준다.
    @Transactional
    Optional<List<PublishCondition>> publish(long problemId) {
        Optional<Row> found = lockLatest(problemId);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        Row latest = found.get();
        if (latest.status() == Status.PUBLISHED) {
            return Optional.of(List.of());
        }
        List<PublishCondition> unmet = unmetConditions(latest.versionId());
        if (!unmet.isEmpty()) {
            return Optional.of(unmet);
        }
        // 문제당 PUBLISHED는 하나다. 유일 인덱스는 지연 검사가 안 되므로 기존 것을 먼저 내린다(database-schema.md).
        jdbc.sql("update problem_versions set status = 'RETIRED' where problem_id = :id and status = 'PUBLISHED'")
                .param("id", problemId).update();
        jdbc.sql("update problem_versions set status = 'PUBLISHED', published_at = now() where id = :id")
                .param("id", latest.versionId()).update();
        return Optional.of(List.of());
    }

    // 없는 문제면 false. 공개 중인 버전이 없으면 아무것도 바꾸지 않는다.
    @Transactional
    boolean unpublish(long problemId) {
        if (lockLatest(problemId).isEmpty()) {
            return false;
        }
        jdbc.sql("update problem_versions set status = 'RETIRED' where problem_id = :id and status = 'PUBLISHED'")
                .param("id", problemId).update();
        return true;
    }

    // 없는 문제면 false. 제출·풀이 통계·리포트 추천이 남아 있으면 FK가 막아 DataIntegrityViolationException이 난다.
    // 예제 실행과 관리자 검증은 사용자 기록으로 세지 않고 먼저 지운다(케이스별 결과는 함께 지워진다).
    @Transactional
    boolean delete(long problemId) {
        if (lockLatest(problemId).isEmpty()) {
            return false;
        }
        jdbc.sql("delete from submissions where submission_kind in ('SAMPLE_RUN', 'VALIDATION')"
                + " and problem_version_id in (select id from problem_versions where problem_id = :id)")
                .param("id", problemId).update();
        jdbc.sql("delete from problem_versions where problem_id = :id").param("id", problemId).update();
        jdbc.sql("delete from problems where id = :id").param("id", problemId).update();
        return true;
    }

    private Optional<Row> lockLatest(long problemId) {
        if (jdbc.sql("select id from problems where id = :id for update").param("id", problemId).query(Long.class).optional().isEmpty()) {
            return Optional.empty();
        }
        return jdbc.sql("select id, version_no, status from problem_versions where problem_id = :id order by version_no desc limit 1")
                .param("id", problemId)
                .query((rs, n) -> new Row(rs.getLong("id"), rs.getInt("version_no"), Status.valueOf(rs.getString("status"))))
                .optional();
    }

    private long insertVersion(long problemId, int versionNo, ProblemInput input, List<Long> tagIds) {
        long versionId = jdbc.sql("insert into problem_versions (problem_id, version_no, title, difficulty, statement_markdown,"
                + " input_description, output_description, constraints_markdown, source_name, source_url, license)"
                + " values (:problemId, :versionNo, :title, :difficulty, :statement, :input, :output, :constraints,"
                + " :sourceName, :sourceUrl, :license) returning id")
                .param("problemId", problemId)
                .param("versionNo", versionNo)
                .params(contentParams(input))
                .query(Long.class)
                .single();
        insertTagsAndLanguages(versionId, input, tagIds);
        return versionId;
    }

    // 최신 버전을 내용·태그·언어·케이스·정답 코드까지 복사해 새 초안(+1)을 만든다.
    // 정답 코드는 다시 검증해야 하므로 verified_at은 복사하지 않는다.
    private long newDraft(Row latest) {
        long draftId = jdbc.sql("insert into problem_versions (problem_id, version_no, title, difficulty, statement_markdown,"
                + " input_description, output_description, constraints_markdown, source_name, source_url, license)"
                + " select problem_id, version_no + 1, title, difficulty, statement_markdown, input_description,"
                + " output_description, constraints_markdown, source_name, source_url, license"
                + " from problem_versions where id = :fromId returning id")
                .param("fromId", latest.versionId())
                .query(Long.class)
                .single();
        for (String copy : List.of(
                "insert into problem_version_tags (problem_version_id, concept_tag_id)"
                        + " select :draftId, concept_tag_id from problem_version_tags where problem_version_id = :fromId",
                "insert into problem_language_configs (problem_version_id, language, time_limit_ms, memory_limit_mb, starter_code)"
                        + " select :draftId, language, time_limit_ms, memory_limit_mb, starter_code"
                        + " from problem_language_configs where problem_version_id = :fromId",
                "insert into test_cases (problem_version_id, ordinal, case_type, input_data, expected_output)"
                        + " select :draftId, ordinal, case_type, input_data, expected_output from test_cases where problem_version_id = :fromId",
                "insert into reference_solutions (problem_version_id, language, solution_role, source_code)"
                        + " select :draftId, language, solution_role, source_code from reference_solutions where problem_version_id = :fromId")) {
            jdbc.sql(copy).param("draftId", draftId).param("fromId", latest.versionId()).update();
        }
        return draftId;
    }

    private List<TestCaseInput> casesOf(long versionId) {
        return jdbc.sql("select case_type, input_data, expected_output from test_cases where problem_version_id = :id order by ordinal")
                .param("id", versionId)
                .query((rs, n) -> new TestCaseInput(CaseType.valueOf(rs.getString("case_type")), rs.getString("input_data"),
                        rs.getString("expected_output")))
                .list();
    }

    // 버전은 문제를 만들 때 함께 생기므로 비어 있으면 없는 문제다.
    private Optional<Long> latestVersionId(long problemId) {
        return jdbc.sql("select id from problem_versions where problem_id = :id order by version_no desc limit 1")
                .param("id", problemId).query(Long.class).optional();
    }

    private void overwrite(long versionId, ProblemInput input, List<Long> tagIds) {
        jdbc.sql("update problem_versions set title = :title, difficulty = :difficulty, statement_markdown = :statement,"
                + " input_description = :input, output_description = :output, constraints_markdown = :constraints,"
                + " source_name = :sourceName, source_url = :sourceUrl, license = :license where id = :id")
                .param("id", versionId)
                .params(contentParams(input))
                .update();
        jdbc.sql("delete from problem_version_tags where problem_version_id = :id").param("id", versionId).update();
        jdbc.sql("delete from problem_language_configs where problem_version_id = :id").param("id", versionId).update();
        insertTagsAndLanguages(versionId, input, tagIds);
    }

    private void insertTagsAndLanguages(long versionId, ProblemInput input, List<Long> tagIds) {
        for (long tagId : tagIds) {
            jdbc.sql("insert into problem_version_tags (problem_version_id, concept_tag_id) values (:versionId, :tagId)")
                    .param("versionId", versionId).param("tagId", tagId).update();
        }
        for (LanguageInput language : input.languages()) {
            jdbc.sql("insert into problem_language_configs (problem_version_id, language, time_limit_ms, memory_limit_mb, starter_code)"
                    + " values (:versionId, :language, :time, :memory, :starter)")
                    .param("versionId", versionId)
                    .param("language", language.language().name())
                    .param("time", language.timeLimitMs())
                    .param("memory", language.memoryLimitMb())
                    .param("starter", language.starterCode())
                    .update();
        }
    }

    private void clearValidation(long versionId) {
        jdbc.sql("delete from submissions where submission_kind = 'VALIDATION' and problem_version_id = :id")
                .param("id", versionId).update();
        jdbc.sql("update reference_solutions set verified_at = null where problem_version_id = :id")
                .param("id", versionId).update();
    }

    private static Map<String, Object> contentParams(ProblemInput input) {
        Map<String, Object> params = new HashMap<>();
        params.put("title", input.title());
        params.put("difficulty", input.difficulty().name());
        params.put("statement", input.statementMarkdown());
        params.put("input", input.inputDescription());
        params.put("output", input.outputDescription());
        params.put("constraints", input.constraintsMarkdown());
        params.put("sourceName", input.sourceName());
        params.put("sourceUrl", input.sourceUrl());
        params.put("license", input.license());
        return params;
    }

    // 언어별 (시간, 메모리). 언어를 더하거나 빼도 달라진다.
    private Map<Language, List<Integer>> limitsOf(long versionId) {
        return languagesOf(versionId).stream()
                .collect(Collectors.toMap(LanguageInput::language, l -> List.of(l.timeLimitMs(), l.memoryLimitMb())));
    }

    private static Map<Language, List<Integer>> limitsOf(List<LanguageInput> languages) {
        return languages.stream()
                .collect(Collectors.toMap(LanguageInput::language, l -> List.of(l.timeLimitMs(), l.memoryLimitMb())));
    }

    // 공개 버전을 그 자리에서 고칠 때 다시 보는 조건. 언어는 제한이 같아야 이 경로를 타므로 늘 둘 다 있다.
    private static List<PublishCondition> textConditions(ProblemInput input) {
        List<PublishCondition> unmet = new ArrayList<>();
        if (input.tags().isEmpty()) {
            unmet.add(PublishCondition.TAG_COUNT);
        }
        if (blank(input.sourceName())) {
            unmet.add(PublishCondition.SOURCE);
        }
        return unmet;
    }

    // ADM-06. #35가 정답 검증 통과를 더한다.
    private List<PublishCondition> unmetConditions(long versionId) {
        return jdbc.sql("select"
                + " (select count(*) from test_cases where problem_version_id = v.id and case_type = 'SAMPLE') >= 2 as samples,"
                + " (select count(*) from test_cases where problem_version_id = v.id and case_type = 'HIDDEN') >= 5 as hidden,"
                + " (select count(*) from problem_version_tags where problem_version_id = v.id) between 1 and 3 as tags,"
                + " v.source_name,"
                + " (select count(*) from problem_language_configs where problem_version_id = v.id) = 2 as languages"
                + " from problem_versions v where v.id = :id")
                .param("id", versionId)
                .query((rs, n) -> {
                    List<PublishCondition> unmet = new ArrayList<>();
                    if (!rs.getBoolean("samples")) unmet.add(PublishCondition.SAMPLE_COUNT);
                    if (!rs.getBoolean("hidden")) unmet.add(PublishCondition.HIDDEN_COUNT);
                    if (!rs.getBoolean("tags")) unmet.add(PublishCondition.TAG_COUNT);
                    if (blank(rs.getString("source_name"))) unmet.add(PublishCondition.SOURCE);
                    if (!rs.getBoolean("languages")) unmet.add(PublishCondition.LANGUAGES);
                    return unmet;
                })
                .single();
    }

    // 공개할 때와 공개 버전을 고칠 때 같은 기준으로 본다(탭·줄바꿈뿐이어도 빈 출처).
    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private Integer publishedVersionNo(long problemId) {
        return jdbc.sql("select version_no from problem_versions where problem_id = :id and status = 'PUBLISHED'")
                .param("id", problemId).query(Integer.class).optional().orElse(null);
    }

    private List<String> tagsOf(long versionId) {
        return jdbc.sql("select t.slug from problem_version_tags pvt join concept_tags t on t.id = pvt.concept_tag_id"
                + " where pvt.problem_version_id = :id order by t.id")
                .param("id", versionId).query(String.class).list();
    }

    // 화면의 언어 순서(Python → C++)대로 준다.
    private List<LanguageInput> languagesOf(long versionId) {
        return jdbc.sql("select language, time_limit_ms, memory_limit_mb, starter_code from problem_language_configs"
                + " where problem_version_id = :id order by case language when 'PYTHON' then 0 else 1 end")
                .param("id", versionId)
                .query((rs, n) -> new LanguageInput(Language.valueOf(rs.getString("language")),
                        rs.getInt("time_limit_ms"), rs.getInt("memory_limit_mb"), rs.getString("starter_code")))
                .list();
    }

    private static Instant instant(OffsetDateTime time) {
        return time == null ? null : time.toInstant();
    }
}
