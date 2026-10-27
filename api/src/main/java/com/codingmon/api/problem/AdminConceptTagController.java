package com.codingmon.api.problem;

import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.problem.ProblemRepository.ConceptTag;

// 개념 태그 등록(ADM-02, #34). 목록은 GET /api/concept-tags(ProblemController)다.
@RestController
@RequestMapping("/api/admin/concept-tags")
class AdminConceptTagController {

    // 영문 소문자·숫자를 '-' 하나로 잇는다(binary-search). 길이는 DB의 VARCHAR(80)·VARCHAR(100)이다.
    private static final Pattern SLUG = Pattern.compile("[a-z0-9]+(-[a-z0-9]+)*");

    record ConceptTagInput(String slug, String name) {
    }

    private final AdminProblemRepository problems;

    AdminConceptTagController(AdminProblemRepository problems) {
        this.problems = problems;
    }

    // 이름은 앞뒤 공백을 지워 저장·비교한다. 끝에 공백이 붙은 같은 이름이 따로 생기지 않게 한다.
    @PostMapping
    ResponseEntity<ConceptTag> create(@RequestBody ConceptTagInput input) {
        String name = input.name() == null ? null : input.name().strip();
        if (input.slug() == null || input.slug().length() > 80 || !SLUG.matcher(input.slug()).matches()
                || name == null || name.isEmpty() || name.length() > 100 || name.indexOf('\0') >= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        if (!problems.createTag(input.slug(), name)) {
            throw ApiErrors.error(HttpStatus.CONFLICT, "CONCEPT_TAG_EXISTS", "이미 있는 태그 이름이나 slug예요");
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(new ConceptTag(input.slug(), name));
    }
}
