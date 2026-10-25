package com.codingmon.api.submission;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.Language;

// 코드 제출(SOLVE-09)과 예제 실행(SOLVE-08). QUEUED로 저장하는 데까지만 하고, 이후 상태·판정은 채점 처리기(#71)가 갱신한다.
@RestController
class SubmissionController {

    // database-tables.md: source_code는 UTF-8 기준 최대 64KB.
    static final int MAX_SOURCE_BYTES = 64 * 1024;

    // 모르는 언어는 JSON을 읽는 단계에서 code 없는 400이 된다.
    record SubmitRequest(Long problemId, Language language, String sourceCode) {
    }

    private final SubmissionRepository submissions;
    private final ApplicationEventPublisher events;

    SubmissionController(SubmissionRepository submissions, ApplicationEventPublisher events) {
        this.submissions = submissions;
        this.events = events;
    }

    @PostMapping("/api/submissions")
    @Transactional
    ResponseEntity<Map<String, Long>> submit(@RequestBody SubmitRequest body, @AuthenticationPrincipal Jwt jwt) {
        long id = queue(body, jwt, SubmissionRepository.Kind.SUBMIT);
        return ResponseEntity.accepted().location(URI.create("/api/submissions/" + id)).body(Map.of("id", id));
    }

    // 공개 예제만 돌린다. 시도 횟수·풀이 통계·제출 기록에 들어가지 않는다.
    @PostMapping("/api/sample-runs")
    @Transactional
    ResponseEntity<Map<String, Long>> runSamples(@RequestBody SubmitRequest body, @AuthenticationPrincipal Jwt jwt) {
        long id = queue(body, jwt, SubmissionRepository.Kind.SAMPLE_RUN);
        return ResponseEntity.accepted().location(URI.create("/api/sample-runs/" + id)).body(Map.of("id", id));
    }

    // 이벤트는 커밋 뒤에 리스너로 전달되므로 트랜잭션 안에서 발행한다.
    private long queue(SubmitRequest body, Jwt jwt, SubmissionRepository.Kind kind) {
        String source = body.sourceCode();
        // 실수로 낸 빈 제출이 오답으로 쌓이면 시도 횟수·취약 개념·추천의 근거가 흐려진다.
        if (source == null || source.isBlank()) {
            throw ApiErrors.error(HttpStatus.BAD_REQUEST, "SOURCE_EMPTY", "코드를 입력해 주세요");
        }
        if (source.getBytes(StandardCharsets.UTF_8).length > MAX_SOURCE_BYTES) {
            throw ApiErrors.error(HttpStatus.BAD_REQUEST, "SOURCE_TOO_LONG", "코드는 64KB까지 제출할 수 있어요");
        }
        // 아래 값은 화면이 정상적으로는 보낼 수 없어 code 없이 답한다.
        if (source.indexOf('\0') >= 0 || body.problemId() == null || body.language() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        SubmissionRepository.PublishedVersion version = submissions.findPublishedVersion(body.problemId(), body.language())
                .orElseThrow(() -> ApiErrors.error(HttpStatus.NOT_FOUND, "PROBLEM_NOT_FOUND", "문제를 찾을 수 없어요"));
        if (!version.supportsLanguage()) {
            // 열어 둔 탭에서 고른 언어를 그 사이 공개된 새 버전이 뺀 경우다.
            throw ApiErrors.error(HttpStatus.BAD_REQUEST, "LANGUAGE_NOT_SUPPORTED",
                    "이 문제는 그 언어를 지원하지 않아요. 새로고침하고 언어를 다시 골라 주세요");
        }
        long id = submissions.insertQueued(Long.parseLong(jwt.getSubject()), version.id(), kind, body.language(), source);
        events.publishEvent(new SubmissionQueued(id));
        return id;
    }

    // 채점 상태·결과(RES-01~06). 화면이 채점이 끝날 때까지 주기적으로 부른다.
    @GetMapping("/api/submissions/{id}")
    SubmissionRepository.SubmissionResult result(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        return submissions.findResult(Long.parseLong(jwt.getSubject()), id)
                .orElseThrow(() -> ApiErrors.error(HttpStatus.NOT_FOUND, "SUBMISSION_NOT_FOUND", "제출을 찾을 수 없어요"));
    }

    // 예제 실행 상태·예제별 결과(SOLVE-08). 화면이 끝날 때까지 주기적으로 부른다.
    @GetMapping("/api/sample-runs/{id}")
    SubmissionRepository.SampleRunResult sampleRun(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        return submissions.findSampleRun(Long.parseLong(jwt.getSubject()), id)
                .orElseThrow(() -> ApiErrors.error(HttpStatus.NOT_FOUND, "SAMPLE_RUN_NOT_FOUND", "예제 실행을 찾을 수 없어요"));
    }
}
