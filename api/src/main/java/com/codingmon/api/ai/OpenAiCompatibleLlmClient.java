package com.codingmon.api.ai;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.BufferingClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.json.JsonMapper;

// 팀 서버의 오픈 웨이트 모델을 OpenAI 호환 API(/v1/chat/completions)로 부른다.
// Ollama, llama.cpp, vLLM이 같은 규격이라 엔진을 바꿔도 LLM_URL과 LLM_MODEL만 고치면 된다.
// 프롬프트와 응답에는 제출 코드가 들어 있어 로그에 남기지 않는다.
@Component
class OpenAiCompatibleLlmClient implements LlmClient {

    private static final Logger log = LoggerFactory.getLogger(OpenAiCompatibleLlmClient.class);

    private static final String COMPLETIONS = "/v1/chat/completions";

    // 처음 요청과 스키마를 어겼을 때의 재요청 1회
    private static final int MAX_ATTEMPTS = 2;

    private final RestClient rest;
    private final boolean configured;
    private final String model;
    private final Map<ReviewType, String> promptVersions;
    private final int maxOutputTokens;
    private final JsonMapper json;
    private final Validator validator;

    @Autowired
    OpenAiCompatibleLlmClient(@Value("${app.llm.url}") String url, @Value("${app.llm.api-key}") String apiKey,
            @Value("${app.llm.model}") String model,
            @Value("${app.llm.prompt-version.analysis}") String analysisPromptVersion,
            @Value("${app.llm.prompt-version.code-review}") String codeReviewPromptVersion,
            @Value("${app.llm.connect-timeout}") Duration connectTimeout,
            @Value("${app.llm.read-timeout}") Duration readTimeout,
            @Value("${app.llm.max-output-tokens}") int maxOutputTokens, JsonMapper json, Validator validator) {
        this(build(url, apiKey, connectTimeout, readTimeout), !url.isBlank() && !model.isBlank(), model,
                Map.of(ReviewType.ANALYSIS, analysisPromptVersion, ReviewType.CODE_REVIEW, codeReviewPromptVersion),
                maxOutputTokens, json, validator);
    }

    OpenAiCompatibleLlmClient(RestClient rest, boolean configured, String model,
            Map<ReviewType, String> promptVersions, int maxOutputTokens, JsonMapper json, Validator validator) {
        this.rest = rest;
        this.configured = configured;
        this.model = model;
        this.promptVersions = promptVersions;
        this.maxOutputTokens = maxOutputTokens;
        // 값을 바꿔 가며 받아 주면 저장하는 원문은 스키마를 어긴 채로 남는다. 어긴 응답은 그대로 거절해 다시 요청한다.
        this.json = json.rebuild()
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
                .build();
        this.validator = validator;
    }

    private static RestClient build(String url, String apiKey, Duration connectTimeout, Duration readTimeout) {
        SimpleClientHttpRequestFactory requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(connectTimeout);
        requests.setReadTimeout(readTimeout);
        RestClient.Builder builder = RestClient.builder()
                .requestFactory(new BufferingClientHttpRequestFactory(requests)).baseUrl(url);
        if (!apiKey.isBlank()) {
            builder.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey);
        }
        return builder.build();
    }

    @Override
    public String model() {
        return model;
    }

    @Override
    public String promptVersion(ReviewType type) {
        return promptVersions.get(type);
    }

    @Override
    public <T> LlmResponse<T> complete(LlmRequest<T> request) {
        if (!configured) {
            throw new LlmException(LlmException.Kind.UNAVAILABLE, "LLM_URL이나 LLM_MODEL이 비어 있다", null, LlmUsage.NONE);
        }
        Map<String, Object> body = body(request);
        LlmUsage usage = LlmUsage.NONE;
        String problem = "";
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            ChatResponse response = call(body, usage);
            usage = usage.plus(response.tokens());
            String content = response.content();
            try {
                return new LlmResponse<>(read(content, request.responseType()), content, usage);
            } catch (InvalidOutput e) {
                problem = e.getMessage();
                log.warn("LLM 응답이 스키마를 어겼다({}번째): {}", attempt, problem);
            }
        }
        throw new LlmException(LlmException.Kind.INVALID_RESPONSE, "LLM 응답이 스키마를 어겼다: " + problem, null, usage);
    }

    private <T> Map<String, Object> body(LlmRequest<T> request) {
        Map<String, Object> format = Map.of("name", request.schemaName(), "strict", true, "schema", request.schema());
        return Map.of("model", model, "max_tokens", maxOutputTokens, "stream", false,
                "messages", List.of(Map.of("role", "system", "content", request.system()),
                        Map.of("role", "user", "content", request.user())),
                "response_format", Map.of("type", "json_schema", "json_schema", format));
    }

    private ChatResponse call(Map<String, Object> body, LlmUsage usedSoFar) {
        ChatResponse response;
        try {
            response = rest.post().uri(COMPLETIONS).contentType(MediaType.APPLICATION_JSON).body(body).retrieve()
                    .body(ChatResponse.class);
        } catch (RestClientResponseException e) {
            int status = e.getStatusCode().value();
            LlmException.Kind kind = status == 429 ? LlmException.Kind.RATE_LIMITED : LlmException.Kind.UNAVAILABLE;
            throw new LlmException(kind, "LLM 서버가 " + status + "로 응답했다", e, usedSoFar);
        } catch (RestClientException e) {
            // 타임아웃, 연결 실패, 해석할 수 없는 응답
            throw new LlmException(LlmException.Kind.UNAVAILABLE, "LLM 서버를 호출하지 못했다", e, usedSoFar);
        }
        if (response == null) {
            throw new LlmException(LlmException.Kind.UNAVAILABLE, "LLM 서버가 빈 응답을 보냈다", null, usedSoFar);
        }
        return response;
    }

    private <T> T read(String content, Class<T> type) {
        if (content == null || content.isBlank()) {
            throw new InvalidOutput("응답이 비어 있다");
        }
        T value;
        try {
            value = json.readValue(content, type);
        } catch (JacksonException e) {
            // 예외 메시지에 응답 일부가 들어갈 수 있어 옮기지 않는다.
            throw new InvalidOutput("JSON으로 읽을 수 없다");
        }
        if (value == null) {
            throw new InvalidOutput("JSON 값이 null이다");
        }
        Set<ConstraintViolation<T>> violations = validator.validate(value);
        if (!violations.isEmpty()) {
            throw new InvalidOutput(violations.stream().map(v -> v.getPropertyPath().toString()).sorted()
                    .collect(Collectors.joining(", ", "조건을 어긴 항목: ", "")));
        }
        return value;
    }

    private static final class InvalidOutput extends RuntimeException {
        InvalidOutput(String message) {
            super(message);
        }
    }

    record ChatResponse(List<Choice> choices, Usage usage) {

        String content() {
            if (choices == null || choices.isEmpty() || choices.getFirst().message() == null) {
                return null;
            }
            return choices.getFirst().message().content();
        }

        LlmUsage tokens() {
            return usage == null ? LlmUsage.NONE : new LlmUsage(usage.promptTokens(), usage.completionTokens());
        }
    }

    record Choice(Message message) {
    }

    record Message(String content) {
    }

    record Usage(@JsonProperty("prompt_tokens") int promptTokens,
            @JsonProperty("completion_tokens") int completionTokens) {
    }
}
