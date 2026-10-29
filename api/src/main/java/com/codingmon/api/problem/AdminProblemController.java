package com.codingmon.api.problem;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.Language;
import com.codingmon.api.problem.AdminProblemRepository.DeleteResult;
import com.codingmon.api.problem.AdminProblemRepository.Detail;
import com.codingmon.api.problem.AdminProblemRepository.LanguageInput;
import com.codingmon.api.problem.AdminProblemRepository.ProblemInput;
import com.codingmon.api.problem.AdminProblemRepository.PublishCondition;
import com.codingmon.api.problem.AdminProblemRepository.SaveResult;
import com.codingmon.api.problem.AdminProblemRepository.Saved;
import com.codingmon.api.problem.AdminProblemRepository.Solution;
import com.codingmon.api.problem.AdminProblemRepository.SolutionInput;
import com.codingmon.api.problem.AdminProblemRepository.Summary;
import com.codingmon.api.problem.AdminProblemRepository.TestCase;
import com.codingmon.api.problem.AdminProblemRepository.TestCaseInput;
import com.codingmon.api.problem.AdminProblemRepository.ValidateResult;
import com.codingmon.api.problem.AdminProblemRepository.Version;
import com.codingmon.api.problem.AdminProblemRepository.VersionSummary;
import com.codingmon.api.problem.ProblemRepository.Page;
import com.codingmon.api.submission.SubmissionQueued;

// 관리자 문제 관리(ADM-01~03·06·07, #33), 테스트케이스(ADM-04, #34), 정답 코드·검증(ADM-05, #35). ADMIN 검사는 SecurityConfig의 /api/admin/**가 한다.
@RestController
@RequestMapping("/api/admin/problems")
class AdminProblemController {

    // Judge0가 받는 상한(judge/judge0.conf의 MAX_CPU_TIME_LIMIT=20초, MAX_MEMORY_LIMIT=512MB).
    // 1.13.1은 메모리 2MB 미만도 거절한다(judge-verdict-mapping.md 1절). 상한을 내리면 여기도 고친다.
    static final int MAX_TIME_LIMIT_MS = 20_000;
    static final int MIN_MEMORY_LIMIT_MB = 2;
    static final int MAX_MEMORY_LIMIT_MB = 512;

    // 케이스 수·크기 상한(#34 "정한 것", 추후 조정 필요). UTF-8 바이트로 센다.
    // 기대 출력 상한은 채점 서버 출력 상한(Judge0Client.MAX_FILE_SIZE_KB)과 같다. 넘으면 정답 코드도 통과하지 못한다.
    static final int MAX_TEST_CASES = 10;
    static final int MAX_INPUT_BYTES = 2 * 1024 * 1024;
    static final int MAX_OUTPUT_BYTES = 1024 * 1024;
    static final int MAX_TOTAL_BYTES = 10 * 1024 * 1024;

    // 정답 코드 하나의 상한. 학생 제출과 같다(SubmissionController.MAX_SOURCE_BYTES, database-tables.md).
    static final int MAX_SOLUTION_BYTES = 64 * 1024;

    private final AdminProblemRepository problems;
    private final ApplicationEventPublisher events;
    // 채점 서버가 없으면 검증 제출이 끝나지 않아 버전이 VALIDATING에 갇힌다. 채점 처리기와 같은 설정을 본다(Judge0Client).
    private final boolean judgeConfigured;

    AdminProblemController(AdminProblemRepository problems, ApplicationEventPublisher events,
            @Value("${app.judge0.url:}") String judge0Url) {
        this.problems = problems;
        this.events = events;
        this.judgeConfigured = !judge0Url.isBlank();
    }

    @GetMapping
    Page<Summary> list(@RequestParam(required = false) String keyword, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "" + ProblemController.MAX_PAGE_SIZE) int size) {
        if (page < 0 || size < 1 || size > ProblemController.MAX_PAGE_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page는 0 이상, size는 1~" + ProblemController.MAX_PAGE_SIZE + "이다");
        }
        return problems.list(keyword == null || keyword.isBlank() ? null : keyword.strip(), page, size);
    }

    @PostMapping
    ResponseEntity<Map<String, Long>> create(@RequestBody ProblemInput input) {
        long id = problems.create(input, validTagIds(input));
        return ResponseEntity.created(URI.create("/api/admin/problems/" + id)).body(Map.of("id", id));
    }

    @GetMapping("/{id}")
    Detail detail(@PathVariable long id) {
        return problems.detail(id).orElseThrow(AdminProblemController::notFound);
    }

    @PutMapping("/{id}")
    Saved update(@PathVariable long id, @RequestBody ProblemInput input) {
        return saved(problems.update(id, input, validTagIds(input)).orElseThrow(AdminProblemController::notFound));
    }

    @GetMapping("/{id}/test-cases")
    List<TestCase> testCases(@PathVariable long id) {
        return problems.testCases(id).orElseThrow(AdminProblemController::notFound);
    }

    @PutMapping("/{id}/test-cases")
    Saved replaceTestCases(@PathVariable long id, @RequestBody List<TestCaseInput> cases) {
        checkTestCases(cases);
        return saved(problems.replaceTestCases(id, cases).orElseThrow(AdminProblemController::notFound));
    }

    @GetMapping("/{id}/solutions")
    List<Solution> solutions(@PathVariable long id) {
        return problems.solutions(id).orElseThrow(AdminProblemController::notFound);
    }

    @PutMapping("/{id}/solutions")
    Saved replaceSolutions(@PathVariable long id, @RequestBody List<SolutionInput> solutions) {
        return saved(problems.replaceSolutions(id, validSolutions(solutions)).orElseThrow(AdminProblemController::notFound));
    }

    // 저장된 정답 코드를 채점 대기열에 넣는다. 이벤트는 커밋 뒤 리스너로 가므로 트랜잭션 안에서 발행한다(SubmissionController와 같다).
    @PostMapping("/{id}/validate")
    @Transactional
    ResponseEntity<Void> validate(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        if (!judgeConfigured) {
            throw ApiErrors.error(HttpStatus.SERVICE_UNAVAILABLE, "JUDGE_UNAVAILABLE", "지금은 검증할 수 없어요");
        }
        switch (problems.validate(id, Long.parseLong(jwt.getSubject())).orElseThrow(AdminProblemController::notFound)) {
            case ValidateResult.Started started -> started.submissionIds().forEach(s -> events.publishEvent(new SubmissionQueued(s)));
            case ValidateResult.Validating v -> throw validatingRetry();
            case ValidateResult.NotDraft n -> throw conflict("NOT_DRAFT", "초안만 검증할 수 있어요");
            case ValidateResult.NoSolution n -> throw conflict("NO_SOLUTION", "정답 코드를 먼저 저장해 주세요");
            case ValidateResult.NoTestCases n -> throw conflict("NO_TEST_CASES", "테스트케이스를 먼저 저장해 주세요");
            case ValidateResult.LanguageNotConfigured n -> throw conflict("LANGUAGE_NOT_CONFIGURED",
                    (n.language() == Language.PYTHON ? "Python" : "C++") + " 시간·메모리 제한을 먼저 정해 주세요");
        }
        return ResponseEntity.accepted().build();
    }

    // 읽기만 하고 저장하지 않는다. 화면이 표를 채운 뒤 PUT으로 저장한다.
    @PostMapping("/{id}/test-cases/zip")
    List<TestCaseInput> readTestCaseZip(@PathVariable long id, @RequestParam MultipartFile file) throws IOException {
        if (!problems.exists(id)) {
            throw notFound();
        }
        return TestCaseZip.read(file.getBytes());
    }

    @DeleteMapping("/{id}")
    ResponseEntity<Void> delete(@PathVariable long id) {
        DeleteResult result;
        try {
            result = problems.delete(id).orElseThrow(AdminProblemController::notFound);
        } catch (DataIntegrityViolationException e) {
            throw ApiErrors.error(HttpStatus.CONFLICT, "PROBLEM_IN_USE",
                    "사용자 기록이 있는 문제는 지울 수 없어요. 사용자에게서 내리려면 비공개로 바꿔 주세요");
        }
        if (result == DeleteResult.VALIDATING) {
            throw validatingRetry();
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/publish")
    ResponseEntity<Void> publish(@PathVariable long id) {
        switch (problems.publish(id).orElseThrow(AdminProblemController::notFound)) {
            case SaveResult.Ok ok -> {
            }
            case SaveResult.Validating v -> throw validatingRetry();
            case SaveResult.ConditionsBroken broken -> throw conditionsNotMet(broken.unmet());
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/unpublish")
    ResponseEntity<Void> unpublish(@PathVariable long id) {
        if (!problems.unpublish(id)) {
            throw notFound();
        }
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/versions")
    List<VersionSummary> versions(@PathVariable long id) {
        return problems.versions(id).orElseThrow(AdminProblemController::notFound);
    }

    @GetMapping("/{id}/versions/{versionNo}")
    Version version(@PathVariable long id, @PathVariable int versionNo) {
        return problems.version(id, versionNo).orElseThrow(AdminProblemController::notFound);
    }

    // 본문 규칙을 검사하고 태그 id를 준다. 화면이 막는 규칙은 code 없는 400이다(openapi ProblemInputInvalid).
    private List<Long> validTagIds(ProblemInput input) {
        if (input.title() == null || input.title().isBlank() || input.title().length() > 200 || input.difficulty() == null
                || input.statementMarkdown() == null || input.inputDescription() == null || input.outputDescription() == null
                || input.constraintsMarkdown() == null || input.tags() == null || input.languages() == null
                || tooLong(input.sourceName(), 200) || tooLong(input.license(), 120)
                || input.tags().size() > 3 || new HashSet<>(input.tags()).size() != input.tags().size()
                || input.languages().size() > 2 || input.languages().stream().anyMatch(AdminProblemController::incomplete)
                || input.languages().stream().map(LanguageInput::language).distinct().count() != input.languages().size()
                || !webUrl(input.sourceUrl()) || hasNul(input)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        for (LanguageInput language : input.languages()) {
            if (language.timeLimitMs() < 1 || language.timeLimitMs() > MAX_TIME_LIMIT_MS
                    || language.memoryLimitMb() < MIN_MEMORY_LIMIT_MB || language.memoryLimitMb() > MAX_MEMORY_LIMIT_MB) {
                throw ApiErrors.error(HttpStatus.BAD_REQUEST, "LIMIT_OUT_OF_RANGE", "시간 제한은 1~" + MAX_TIME_LIMIT_MS
                        + "ms, 메모리 제한은 " + MIN_MEMORY_LIMIT_MB + "~" + MAX_MEMORY_LIMIT_MB + "MB로 정해 주세요");
            }
        }
        Map<String, Long> ids = problems.tagIds(input.tags());
        return input.tags().stream()
                .map(slug -> {
                    Long tagId = ids.get(slug);
                    if (tagId == null) {
                        throw ApiErrors.error(HttpStatus.BAD_REQUEST, "TAG_NOT_FOUND", "없는 태그예요: " + slug);
                    }
                    return tagId;
                })
                .toList();
    }

    private static boolean incomplete(LanguageInput language) {
        return language == null || language.language() == null || language.timeLimitMs() == null
                || language.memoryLimitMb() == null || language.starterCode() == null;
    }

    private static boolean tooLong(String value, int max) {
        return value != null && value.length() > max;
    }

    // 사용자 화면에 링크로 나가므로 javascript: 같은 주소를 막는다.
    private static boolean webUrl(String url) {
        return url == null || url.startsWith("http://") || url.startsWith("https://");
    }

    // PostgreSQL 문자열은 NUL을 저장하지 못한다.
    private static boolean hasNul(ProblemInput input) {
        return Stream.concat(Stream.of(input.title(), input.statementMarkdown(), input.inputDescription(),
                        input.outputDescription(), input.constraintsMarkdown(), input.sourceName(), input.sourceUrl(),
                        input.license()), Stream.concat(input.tags().stream(), input.languages().stream().map(LanguageInput::starterCode)))
                .anyMatch(value -> value != null && value.indexOf('\0') >= 0);
    }

    // 언어별 정답 코드. 빈 코드(공백뿐 포함)는 없는 것으로 보고 빼서, 저장할 때 그 언어 정답 코드가 지워진다.
    // 화면이 막는 규칙(null 칸, 같은 언어 두 번, NUL 글자)은 code 없는 400이다.
    private static Map<Language, String> validSolutions(List<SolutionInput> solutions) {
        if (solutions == null || solutions.stream().anyMatch(s -> s == null || s.language() == null || s.sourceCode() == null
                || s.sourceCode().indexOf('\0') >= 0)
                || solutions.stream().map(SolutionInput::language).distinct().count() != solutions.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        Map<Language, String> wanted = new EnumMap<>(Language.class);
        for (SolutionInput solution : solutions) {
            if (solution.sourceCode().isBlank()) {
                continue;
            }
            if (solution.sourceCode().getBytes(StandardCharsets.UTF_8).length > MAX_SOLUTION_BYTES) {
                throw ApiErrors.error(HttpStatus.BAD_REQUEST, "SOURCE_TOO_LONG", "정답 코드는 64KB까지 넣을 수 있어요");
            }
            wanted.put(solution.language(), solution.sourceCode());
        }
        return wanted;
    }

    // 화면이 막는 규칙(null 칸, NUL 글자)은 code 없는 400이다.
    private static void checkTestCases(List<TestCaseInput> cases) {
        if (cases == null || cases.stream().anyMatch(c -> c == null || c.caseType() == null || c.input() == null
                || c.output() == null || c.input().indexOf('\0') >= 0 || c.output().indexOf('\0') >= 0)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        if (cases.size() > MAX_TEST_CASES) {
            throw tooManyTestCases();
        }
        long total = 0;
        for (int i = 0; i < cases.size(); i++) {
            int inputBytes = cases.get(i).input().getBytes(StandardCharsets.UTF_8).length;
            int outputBytes = cases.get(i).output().getBytes(StandardCharsets.UTF_8).length;
            if (inputBytes > MAX_INPUT_BYTES) {
                throw limitExceeded((i + 1) + "번째 케이스의 입력이 " + mib(MAX_INPUT_BYTES) + "를 넘어요");
            }
            if (outputBytes > MAX_OUTPUT_BYTES) {
                throw limitExceeded((i + 1) + "번째 케이스의 기대 출력이 " + mib(MAX_OUTPUT_BYTES) + "를 넘어요");
            }
            total += inputBytes + outputBytes;
        }
        if (total > MAX_TOTAL_BYTES) {
            throw totalTooLarge();
        }
    }

    static ErrorResponseException tooManyTestCases() {
        return limitExceeded("케이스는 " + MAX_TEST_CASES + "개까지 넣을 수 있어요");
    }

    static ErrorResponseException totalTooLarge() {
        return limitExceeded("케이스를 모두 합쳐 " + mib(MAX_TOTAL_BYTES) + "를 넘어요");
    }

    static ErrorResponseException limitExceeded(String detail) {
        return ApiErrors.error(HttpStatus.BAD_REQUEST, "TEST_CASE_LIMIT_EXCEEDED", detail);
    }

    static String mib(int bytes) {
        return bytes / (1024 * 1024) + "MiB";
    }

    private static Saved saved(SaveResult result) {
        return switch (result) {
            case SaveResult.Ok ok -> ok.saved();
            case SaveResult.Validating v -> throw ApiErrors.error(HttpStatus.CONFLICT, "PROBLEM_VALIDATING",
                    "정답 코드를 검증하는 중이에요. 검증이 끝난 뒤 다시 저장해 주세요");
            case SaveResult.ConditionsBroken broken -> throw conditionsNotMet(broken.unmet());
        };
    }

    private static ErrorResponseException conditionsNotMet(List<PublishCondition> unmet) {
        ErrorResponseException error = ApiErrors.error(HttpStatus.CONFLICT, "PUBLISH_CONDITIONS_NOT_MET", "공개 조건을 모두 채워 주세요");
        error.getBody().setProperty("unmetConditions", unmet);
        return error;
    }

    private static ErrorResponseException validatingRetry() {
        return ApiErrors.error(HttpStatus.CONFLICT, "PROBLEM_VALIDATING", "정답 코드를 검증하는 중이에요. 검증이 끝난 뒤 다시 시도해 주세요");
    }

    private static ErrorResponseException conflict(String code, String detail) {
        return ApiErrors.error(HttpStatus.CONFLICT, code, detail);
    }

    private static ErrorResponseException notFound() {
        return ApiErrors.error(HttpStatus.NOT_FOUND, "PROBLEM_NOT_FOUND", "문제를 찾을 수 없어요");
    }
}
