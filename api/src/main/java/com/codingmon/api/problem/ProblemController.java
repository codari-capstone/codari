package com.codingmon.api.problem;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.problem.ProblemRepository.ConceptTag;
import com.codingmon.api.problem.ProblemRepository.Difficulty;
import com.codingmon.api.problem.ProblemRepository.ListQuery;
import com.codingmon.api.problem.ProblemRepository.Page;
import com.codingmon.api.problem.ProblemRepository.ProblemSummary;
import com.codingmon.api.problem.ProblemRepository.PublishedProblem;
import com.codingmon.api.problem.ProblemRepository.SolveStatus;
import com.codingmon.api.problem.ProblemRepository.SortField;

@RestController
@RequestMapping("/api")
class ProblemController {

    static final int MAX_PAGE_SIZE = 20;

    private final ProblemRepository problems;

    ProblemController(ProblemRepository problems) {
        this.problems = problems;
    }

    // LIST-01~05. 비로그인도 쓴다(COM-05). 로그인했으면 SecurityConfig가 토큰을 검증해 jwt를 넘긴다.
    @GetMapping("/problems")
    Page<ProblemSummary> list(@RequestParam(required = false) String keyword,
            @RequestParam(required = false) List<Difficulty> difficulty,
            @RequestParam(required = false) List<String> tag,
            @RequestParam(required = false) List<SolveStatus> status,
            @RequestParam(defaultValue = "id,asc") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "" + MAX_PAGE_SIZE) int size,
            @AuthenticationPrincipal Jwt jwt) {
        String[] sortParts = sort.split(",", -1);
        if (sortParts.length != 2) {
            throw badRequest("sort는 '<id|difficulty>,<asc|desc>' 형식이어야 한다");
        }
        SortField sortField = switch (sortParts[0]) {
            case "id" -> SortField.ID;
            case "difficulty" -> SortField.DIFFICULTY;
            default -> throw badRequest("sort 필드는 id 또는 difficulty다");
        };
        boolean ascending = switch (sortParts[1]) {
            case "asc" -> true;
            case "desc" -> false;
            default -> throw badRequest("sort 방향은 asc 또는 desc다");
        };
        // 마지막 페이지보다 큰 page는 빈 content를 준다. 마지막 페이지로 옮기는 건 프런트가 totalElements로 한다.
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw badRequest("page는 0 이상, size는 1~" + MAX_PAGE_SIZE + "이다");
        }
        String trimmed = keyword == null || keyword.isBlank() ? null : keyword.strip();
        Long userId = jwt == null ? null : Long.valueOf(jwt.getSubject());
        return problems.findPublished(new ListQuery(userId, trimmed, orEmpty(difficulty), orEmpty(tag), orEmpty(status),
                sortField, ascending, page, size));
    }

    // 문제 풀이 화면(SOLVE-01~04, 06). 로그인해야 본다(COM-05, SecurityConfig).
    // 없는 문제와 공개 버전이 없는 문제를 같은 404로 답해 공개 전 문제가 있는지 드러내지 않는다.
    @GetMapping("/problems/{id}")
    PublishedProblem detail(@PathVariable long id) {
        return problems.findPublished(id)
                .orElseThrow(() -> ApiErrors.error(HttpStatus.NOT_FOUND, "PROBLEM_NOT_FOUND", "문제를 찾을 수 없어요"));
    }

    // 필터 선택지용 전체 태그. 목록 결과에서 뽑으면 필터를 걸수록 선택지가 줄어든다.
    @GetMapping("/concept-tags")
    List<ConceptTag> conceptTags() {
        return problems.findAllTags();
    }

    // 빈 값(`?difficulty=`)은 고르지 않은 것으로 본다. enum 변환이 빈 문자열을 null로 바꿔 넘긴다.
    private static <T> List<T> orEmpty(List<T> values) {
        return values == null ? List.of() : values.stream().filter(v -> v != null && !"".equals(v)).toList();
    }

    private static ResponseStatusException badRequest(String detail) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, detail);
    }
}
