package com.codingmon.api.problem;

import java.net.URI;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
import org.springframework.web.server.ResponseStatusException;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.problem.AdminProblemRepository.Detail;
import com.codingmon.api.problem.AdminProblemRepository.LanguageInput;
import com.codingmon.api.problem.AdminProblemRepository.ProblemInput;
import com.codingmon.api.problem.AdminProblemRepository.PublishCondition;
import com.codingmon.api.problem.AdminProblemRepository.SaveResult;
import com.codingmon.api.problem.AdminProblemRepository.Saved;
import com.codingmon.api.problem.AdminProblemRepository.Summary;
import com.codingmon.api.problem.AdminProblemRepository.Version;
import com.codingmon.api.problem.AdminProblemRepository.VersionSummary;
import com.codingmon.api.problem.ProblemRepository.Page;

// 관리자 문제 관리(ADM-01~03·06·07, #33). ADMIN 검사는 SecurityConfig의 /api/admin/**가 한다.
@RestController
@RequestMapping("/api/admin/problems")
class AdminProblemController {

    // Judge0가 받는 상한(judge/judge0.conf의 MAX_CPU_TIME_LIMIT=20초, MAX_MEMORY_LIMIT=512MB).
    // 1.13.1은 메모리 2MB 미만도 거절한다(judge-verdict-mapping.md 1절). 상한을 내리면 여기도 고친다.
    static final int MAX_TIME_LIMIT_MS = 20_000;
    static final int MIN_MEMORY_LIMIT_MB = 2;
    static final int MAX_MEMORY_LIMIT_MB = 512;

    private final AdminProblemRepository problems;

    AdminProblemController(AdminProblemRepository problems) {
        this.problems = problems;
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
        SaveResult result = problems.update(id, input, validTagIds(input)).orElseThrow(AdminProblemController::notFound);
        return switch (result) {
            case SaveResult.Ok ok -> ok.saved();
            case SaveResult.Validating v -> throw ApiErrors.error(HttpStatus.CONFLICT, "PROBLEM_VALIDATING",
                    "정답 코드를 검증하는 중이에요. 검증이 끝난 뒤 다시 저장해 주세요");
            case SaveResult.ConditionsBroken broken -> throw conditionsNotMet(broken.unmet());
        };
    }

    @DeleteMapping("/{id}")
    ResponseEntity<Void> delete(@PathVariable long id) {
        boolean found;
        try {
            found = problems.delete(id);
        } catch (DataIntegrityViolationException e) {
            throw ApiErrors.error(HttpStatus.CONFLICT, "PROBLEM_IN_USE",
                    "사용자 기록이 있는 문제는 지울 수 없어요. 사용자에게서 내리려면 비공개로 바꿔 주세요");
        }
        if (!found) {
            throw notFound();
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/publish")
    ResponseEntity<Void> publish(@PathVariable long id) {
        List<PublishCondition> unmet = problems.publish(id).orElseThrow(AdminProblemController::notFound);
        if (!unmet.isEmpty()) {
            throw conditionsNotMet(unmet);
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

    private static ErrorResponseException conditionsNotMet(List<PublishCondition> unmet) {
        ErrorResponseException error = ApiErrors.error(HttpStatus.CONFLICT, "PUBLISH_CONDITIONS_NOT_MET", "공개 조건을 모두 채워 주세요");
        error.getBody().setProperty("unmetConditions", unmet);
        return error;
    }

    private static ErrorResponseException notFound() {
        return ApiErrors.error(HttpStatus.NOT_FOUND, "PROBLEM_NOT_FOUND", "문제를 찾을 수 없어요");
    }
}
