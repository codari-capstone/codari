package com.codingmon.api.judge;

import java.math.BigDecimal;
import java.net.ConnectException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.BufferingClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import com.codingmon.api.Language;

// Judge0 API 호출(judge-verdict-mapping.md 1절·6절). 채점 처리기와 예제 실행이 같이 쓴다.
// 제한값·컴파일 옵션은 여기서만 정한다. 브라우저에서 온 값은 소스 코드 말고는 Judge0 요청에 넣지 않는다.
@Component
class Judge0Client {

    private static final Logger log = LoggerFactory.getLogger(Judge0Client.class);

    // judge0.conf의 MAX_SUBMISSION_BATCH_SIZE. 넘기면 422가 온다.
    static final int MAX_BATCH = 20;

    // 출력 제한(KB). 서버 기본값과 같아도 보낸다. CaseJudge의 출력 초과 기준도 이 값이다.
    static final int MAX_FILE_SIZE_KB = 1024;

    // judge0.conf의 MAX_WALL_TIME_LIMIT(초). 넘는 값을 보내면 422가 온다.
    private static final BigDecimal MAX_WALL_TIME_LIMIT = BigDecimal.valueOf(30);

    // judge/README.md 언어 절. Judge0 이미지를 바꾸면 /languages로 다시 확인한다.
    private static final Map<Language, Integer> LANGUAGE_IDS = Map.of(Language.PYTHON, 71, Language.CPP, 54);

    // GCC 9.2 기본 표준이 gnu++14라 C++17을 쓰려면 옵션이 필요하다. Python에 보내면 422다.
    private static final String CPP_COMPILER_OPTIONS = "-O2 -std=c++17";

    // 기본 응답에는 exit_code가 없어 필드를 명시한다.
    private static final String RESULT_FIELDS = "token,status,stdout,stderr,compile_output,time,memory,exit_code,exit_signal";

    private static final int MAX_ATTEMPTS = 4;

    private static final ParameterizedTypeReference<List<Map<String, Object>>> ITEMS = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<Map<String, List<Map<String, Object>>>> SUBMISSIONS =
            new ParameterizedTypeReference<>() {
            };

    private final RestClient rest;
    private final boolean configured;
    private final Duration initialBackoff;

    @Autowired
    Judge0Client(@Value("${app.judge0.url}") String url, @Value("${app.judge0.authn-token}") String authnToken,
            @Value("${app.judge0.connect-timeout}") Duration connectTimeout,
            @Value("${app.judge0.read-timeout}") Duration readTimeout) {
        this(build(url, authnToken, connectTimeout, readTimeout), !url.isBlank(), Duration.ofMillis(500));
    }

    Judge0Client(RestClient rest, boolean configured, Duration initialBackoff) {
        this.rest = rest;
        this.configured = configured;
        this.initialBackoff = initialBackoff;
    }

    private static RestClient build(String url, String authnToken, Duration connectTimeout, Duration readTimeout) {
        // 채점 서버가 응답하지 않아도 실행 슬롯이 무한정 묶이지 않게 한다.
        SimpleClientHttpRequestFactory requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(connectTimeout);
        requests.setReadTimeout(readTimeout);
        // JSON 본문을 길이를 모른 채 chunked로 보내면 Judge0(Rails)가 Content-Length만큼만 읽어 빈 본문으로 본다.
        // 본문을 모아 Content-Length를 붙여 보낸다.
        return RestClient.builder().requestFactory(new BufferingClientHttpRequestFactory(requests)).baseUrl(url)
                .defaultHeader("X-Auth-Token", authnToken).build();
    }

    // URL이 비어 있으면 채점 처리기가 돌지 않는다. 로컬에서 Judge0 없이 API만 띄울 때 그렇다.
    boolean isConfigured() {
        return configured;
    }

    // CaseJudge가 판정에 쓰는 한도. 요청에 보낸 값과 같아야 한다.
    static CaseJudge.Limits judgeLimits(int memoryLimitMb) {
        return new CaseJudge.Limits(memoryLimitMb * 1024, MAX_FILE_SIZE_KB * 1024);
    }

    // 테스트케이스마다 같은 코드를 stdin만 바꿔 보낸다. 토큰을 stdins와 같은 순서로 돌려준다.
    // 제한값은 problem_language_configs의 값이다. Python 보정은 문제를 등록할 때 반영해 저장하므로 여기서 다시 곱하지 않는다.
    List<String> submit(Language language, String sourceCode, int timeLimitMs, int memoryLimitMb, List<String> stdins) {
        if (stdins.isEmpty() || stdins.size() > MAX_BATCH) {
            throw new IllegalArgumentException("한 번에 1~" + MAX_BATCH + "개만 보낸다: " + stdins.size());
        }
        Map<String, Object> common = requestFields(language, sourceCode, timeLimitMs, memoryLimitMb);
        List<Map<String, Object>> submissions = new ArrayList<>();
        for (String stdin : stdins) {
            Map<String, Object> submission = new HashMap<>(common);
            submission.put("stdin", encode(stdin));
            submissions.add(submission);
        }
        // 응답을 못 받으면 제출이 들어갔는지 알 수 없다. 다시 보내면 같은 코드가 두 번 실행될 수 있어
        // 요청이 서버에 닿지 않은 경우(연결 거부)와 큐가 찬 경우(503)만 다시 보낸다(6절).
        List<Map<String, Object>> items = call("제출", false, () -> rest.post()
                .uri("/submissions/batch?base64_encoded=true")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("submissions", submissions))
                .retrieve()
                .body(ITEMS));
        if (items == null || items.size() != stdins.size()) {
            throw new Judge0Exception("묶음 제출 응답의 항목 수가 다르다: " + (items == null ? null : items.size()));
        }
        List<String> tokens = new ArrayList<>();
        for (Map<String, Object> item : items) {
            // 일부 항목만 잘못되면 201에 그 항목만 오류가 온다. 토큰을 받은 다른 항목의 결과도 쓰지 않는다.
            if (!(item.get("token") instanceof String token)) {
                log.error("Judge0가 묶음 제출 항목을 거절했다: {}", item);
                throw new Judge0Exception("묶음 제출 항목이 거절됐다");
            }
            tokens.add(token);
        }
        return tokens;
    }

    // 토큰별 결과. 다시 물어도 같은 결과가 오므로 연결 오류·타임아웃·5xx는 다시 묻는다.
    Map<String, Judge0Result> fetch(List<String> tokens) {
        Map<String, Judge0Result> results = new LinkedHashMap<>();
        for (int from = 0; from < tokens.size(); from += MAX_BATCH) {
            String joined = String.join(",", tokens.subList(from, Math.min(from + MAX_BATCH, tokens.size())));
            Map<String, List<Map<String, Object>>> body = call("결과 조회", true, () -> rest.get()
                    .uri(uri -> uri.path("/submissions/batch").queryParam("tokens", joined)
                            .queryParam("base64_encoded", "true").queryParam("fields", RESULT_FIELDS).build())
                    .retrieve()
                    .body(SUBMISSIONS));
            List<Map<String, Object>> items = body == null ? null : body.get("submissions");
            for (Map<String, Object> item : items == null ? List.<Map<String, Object>>of() : items) {
                if (item != null && item.get("token") instanceof String token) {
                    results.put(token, toResult(item));
                }
            }
        }
        // 토큰이 채점 서버에 없다(Judge0 DB를 새로 만든 경우 등). 다시 물어도 같다.
        for (String token : tokens) {
            if (!results.containsKey(token)) {
                throw new Judge0Exception("채점 서버에 없는 토큰이다: " + token);
            }
        }
        return results;
    }

    private static Map<String, Object> requestFields(Language language, String sourceCode, int timeLimitMs, int memoryLimitMb) {
        BigDecimal cpu = BigDecimal.valueOf(timeLimitMs, 3);
        int memoryKb = memoryLimitMb * 1024;
        Map<String, Object> fields = new HashMap<>();
        fields.put("language_id", LANGUAGE_IDS.get(language));
        fields.put("source_code", encode(sourceCode));
        fields.put("cpu_time_limit", cpu);
        // 보내지 않으면 서버 기본값(5초)이 적용돼 제한이 5초를 넘는 문제는 정답도 끊긴다(1절).
        fields.put("wall_time_limit", cpu.multiply(BigDecimal.TWO).add(BigDecimal.ONE).min(MAX_WALL_TIME_LIMIT));
        fields.put("memory_limit", memoryKb);
        // 스택을 메모리 한도와 같게 둬야 끝없는 재귀가 SIGSEGV가 아니라 메모리 초과로 판정된다.
        fields.put("stack_limit", memoryKb);
        fields.put("max_file_size", MAX_FILE_SIZE_KB);
        if (language == Language.CPP) {
            fields.put("compiler_options", CPP_COMPILER_OPTIONS);
        }
        return fields;
    }

    private static Judge0Result toResult(Map<String, Object> item) {
        Object status = item.get("status") instanceof Map<?, ?> map ? map.get("id") : null;
        if (!(status instanceof Number statusId)) {
            throw new Judge0Exception("결과에 status가 없다: " + item.get("token"));
        }
        return new Judge0Result(statusId.intValue(), decode(item.get("stdout")), decode(item.get("stderr")),
                decode(item.get("compile_output")), item.get("time") == null ? null : new BigDecimal(item.get("time").toString()),
                integer(item.get("memory")), integer(item.get("exit_code")), integer(item.get("exit_signal")));
    }

    private <T> T call(String what, boolean idempotent, Supplier<T> request) {
        Duration backoff = initialBackoff;
        for (int attempt = 1;; attempt++) {
            try {
                return request.get();
            } catch (RestClientResponseException e) {
                int status = e.getStatusCode().value();
                if (status == 400 || status == 401 || status == 403 || status == 422) {
                    // 토큰·요청 값 오류라 다시 보내도 같다. 모든 제출이 채점 불가가 되므로 운영자가 봐야 한다.
                    log.error("Judge0 {} 요청이 {}로 거절됐다: {}", what, status, e.getResponseBodyAsString());
                    throw new Judge0Exception("Judge0 " + what + " " + status, e);
                }
                if (!(status == 503 || (idempotent && status >= 500)) || attempt >= MAX_ATTEMPTS) {
                    throw new Judge0Exception("Judge0 " + what + " " + status + " (" + attempt + "회 시도)", e);
                }
            } catch (ResourceAccessException e) {
                if (!(idempotent || e.getCause() instanceof ConnectException) || attempt >= MAX_ATTEMPTS) {
                    throw new Judge0Exception("Judge0 " + what + " 연결 실패 (" + attempt + "회 시도)", e);
                }
            }
            sleep(backoff);
            backoff = backoff.multipliedBy(2);
        }
    }

    private static void sleep(Duration duration) {
        try {
            Thread.sleep(duration);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new Judge0Exception("Judge0 재시도 대기 중 중단됐다", e);
        }
    }

    private static String encode(String text) {
        return Base64.getEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8));
    }

    // Judge0(Ruby)는 base64를 60자마다 줄바꿈해 준다. MIME 디코더는 줄바꿈을 건너뛴다.
    private static byte[] decode(Object value) {
        return value == null ? null : Base64.getMimeDecoder().decode(value.toString());
    }

    private static Integer integer(Object value) {
        return value instanceof Number number ? number.intValue() : null;
    }
}
