package com.codingmon.api.problem;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.codingmon.api.problem.ProblemRepository.ConceptTag;
import com.codingmon.api.problem.ProblemRepository.Difficulty;
import com.codingmon.api.problem.ProblemRepository.ListQuery;
import com.codingmon.api.problem.ProblemRepository.Page;
import com.codingmon.api.problem.ProblemRepository.ProblemSummary;
import com.codingmon.api.problem.ProblemRepository.SolveStatus;
import com.codingmon.api.problem.ProblemRepository.SortField;

@RestController
@RequestMapping("/api")
class ProblemController {

    static final int MAX_PAGE_SIZE = 100;

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
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
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
        // 둘 중 하나만 오면 나머지는 협업 규칙의 기본값(page=0, size=20)으로 채운다.
        if (page != null || size != null) {
            page = page == null ? 0 : page;
            size = size == null ? 20 : size;
            if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
                throw badRequest("page는 0 이상, size는 1~" + MAX_PAGE_SIZE + "이다");
            }
        }
        String trimmed = keyword == null || keyword.isBlank() ? null : keyword.strip();
        Long userId = jwt == null ? null : Long.valueOf(jwt.getSubject());
        return problems.findPublished(new ListQuery(userId, trimmed, orEmpty(difficulty), orEmpty(tag), orEmpty(status),
                sortField, ascending, page, size));
    }

    // 필터 선택지용 전체 태그. 목록 결과에서 뽑으면 필터를 걸수록 선택지가 줄어든다.
    @GetMapping("/concept-tags")
    List<ConceptTag> conceptTags() {
        return problems.findAllTags();
    }

    private static <T> List<T> orEmpty(List<T> values) {
        return values == null ? List.of() : values;
    }

    private static ResponseStatusException badRequest(String detail) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, detail);
    }
}
