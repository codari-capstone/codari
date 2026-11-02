package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.ExpectedCount.twice;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.net.SocketTimeoutException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.ResponseCreator;
import org.springframework.web.client.RestClient;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import tools.jackson.databind.json.JsonMapper;

class OpenAiCompatibleLlmClientTest {

    private static final String COMPLETIONS = "http://llm.test/v1/chat/completions";
    private static final String VALID = "{\"summary\":\"경계값을 놓쳤다\",\"lines\":[3]}";
    private static final Map<String, Object> SCHEMA = Map.of("type", "object", "required", List.of("summary", "lines"));
    private static final LlmRequest<Answer> REQUEST = new LlmRequest<>("시스템 지시", "제출 코드", "answer", SCHEMA, Answer.class);
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();
    private static final Map<ReviewType, String> VERSIONS = Map.of(ReviewType.ANALYSIS, "analysis-v2", ReviewType.CODE_REVIEW, "review-v1");

    record Answer(@NotBlank String summary, @NotEmpty List<Integer> lines) {
    }

    private MockRestServiceServer server;
    private RestClient rest;
    private OpenAiCompatibleLlmClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://llm.test")
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer k");
        server = MockRestServiceServer.bindTo(builder).build();
        rest = builder.build();
        client = new OpenAiCompatibleLlmClient(rest, true, "test-model", VERSIONS, 1000, JSON, VALIDATOR);
    }

    private static ResponseCreator chat(String content, int input, int output) {
        Map<String, Object> message = new HashMap<>();
        message.put("content", content);
        String body = JSON.writeValueAsString(Map.of("choices", List.of(Map.of("message", message)),
                "usage", Map.of("prompt_tokens", input, "completion_tokens", output)));
        return withSuccess(body, MediaType.APPLICATION_JSON);
    }

    @Test
    void 모델과_스키마를_지정해_요청하고_값과_토큰을_돌려준다() {
        server.expect(once(), requestTo(COMPLETIONS))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer k"))
                .andExpect(jsonPath("$.model").value("test-model"))
                .andExpect(jsonPath("$.max_tokens").value(1000))
                .andExpect(jsonPath("$.stream").value(false))
                .andExpect(jsonPath("$.messages[0].role").value("system"))
                .andExpect(jsonPath("$.messages[0].content").value("시스템 지시"))
                .andExpect(jsonPath("$.messages[1].role").value("user"))
                .andExpect(jsonPath("$.messages[1].content").value("제출 코드"))
                .andExpect(jsonPath("$.response_format.type").value("json_schema"))
                .andExpect(jsonPath("$.response_format.json_schema.name").value("answer"))
                .andExpect(jsonPath("$.response_format.json_schema.strict").value(true))
                .andExpect(jsonPath("$.response_format.json_schema.schema.required[0]").value("summary"))
                .andRespond(chat(VALID, 120, 45));

        LlmResponse<Answer> response = client.complete(REQUEST);

        assertThat(response.value()).isEqualTo(new Answer("경계값을 놓쳤다", List.of(3)));
        assertThat(response.json()).isEqualTo(VALID);
        assertThat(response.usage()).isEqualTo(new LlmUsage(120, 45));
        server.verify();
    }

    @Test
    void 사용량을_주지_않는_엔진은_토큰을_0으로_본다() {
        String body = JSON.writeValueAsString(Map.of("choices", List.of(Map.of("message", Map.of("content", VALID)))));
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        assertThat(client.complete(REQUEST).usage()).isEqualTo(LlmUsage.NONE);
    }

    @Test
    void 조건을_어긴_응답은_한_번_다시_요청하고_토큰을_합친다() {
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(chat("{\"summary\":\"\",\"lines\":[]}", 100, 10));
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(chat(VALID, 100, 20));

        LlmResponse<Answer> response = client.complete(REQUEST);

        assertThat(response.value().summary()).isEqualTo("경계값을 놓쳤다");
        assertThat(response.usage()).isEqualTo(new LlmUsage(200, 30));
        server.verify();
    }

    @Test
    void 잘린_JSON도_한_번_다시_요청한다() {
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(chat("{\"summary\":\"경계", 100, 1000));
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(chat(VALID, 100, 20));

        assertThat(client.complete(REQUEST).json()).isEqualTo(VALID);
        server.verify();
    }

    @Test
    void 두_번_다_어기면_쓴_토큰과_함께_실패한다() {
        server.expect(twice(), requestTo(COMPLETIONS)).andRespond(chat("정답은 이렇습니다", 100, 10));

        assertThatThrownBy(() -> client.complete(REQUEST))
                .isInstanceOfSatisfying(LlmException.class, e -> {
                    assertThat(e.kind()).isEqualTo(LlmException.Kind.INVALID_RESPONSE);
                    assertThat(e.usage()).isEqualTo(new LlmUsage(200, 20));
                    // 모델 응답에는 사용자 코드가 섞일 수 있어 메시지에 옮기지 않는다.
                    assertThat(e.getMessage()).doesNotContain("정답은");
                });
        server.verify();
    }

    @Test
    void 내용이_없는_응답도_스키마_위반으로_다룬다() {
        server.expect(twice(), requestTo(COMPLETIONS)).andRespond(chat(null, 100, 0));

        assertThatThrownBy(() -> client.complete(REQUEST))
                .isInstanceOfSatisfying(LlmException.class,
                        e -> assertThat(e.kind()).isEqualTo(LlmException.Kind.INVALID_RESPONSE));
    }

    @Test
    void JSON_null도_스키마_위반으로_다룬다() {
        server.expect(twice(), requestTo(COMPLETIONS)).andRespond(chat("null", 100, 1));

        assertThatThrownBy(() -> client.complete(REQUEST))
                .isInstanceOfSatisfying(LlmException.class, e -> {
                    assertThat(e.kind()).isEqualTo(LlmException.Kind.INVALID_RESPONSE);
                    assertThat(e.usage()).isEqualTo(new LlmUsage(200, 2));
                });
    }

    @Test
    void 실수를_정수로_바꿔_받지_않고_다시_요청한다() {
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(chat("{\"summary\":\"요약\",\"lines\":[3.7]}", 100, 10));
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(chat(VALID, 100, 20));

        assertThat(client.complete(REQUEST).json()).isEqualTo(VALID);
        server.verify();
    }

    @Test
    void 문자열을_숫자로_바꿔_받지_않고_다시_요청한다() {
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(chat("{\"summary\":\"요약\",\"lines\":[\"3\"]}", 100, 10));
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(chat(VALID, 100, 20));

        assertThat(client.complete(REQUEST).json()).isEqualTo(VALID);
        server.verify();
    }

    @Test
    void 스키마에_없는_칸이_있으면_다시_요청한다() {
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(chat("{\"summary\":\"요약\",\"lines\":[3],\"extra\":true}", 100, 10));
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(chat(VALID, 100, 20));

        assertThat(client.complete(REQUEST).json()).isEqualTo(VALID);
        server.verify();
    }

    @Test
    void 응답_본문이_비면_장애다() {
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(withSuccess("", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.complete(REQUEST))
                .isInstanceOfSatisfying(LlmException.class,
                        e -> assertThat(e.kind()).isEqualTo(LlmException.Kind.UNAVAILABLE));
    }

    @Test
    void 응답_본문이_null이면_장애다() {
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(withSuccess("null", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.complete(REQUEST))
                .isInstanceOfSatisfying(LlmException.class,
                        e -> assertThat(e.kind()).isEqualTo(LlmException.Kind.UNAVAILABLE));
    }

    @Test
    void 재요청_응답이_비어도_앞서_쓴_토큰을_넘겨준다() {
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(chat("{}", 100, 10));
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(withSuccess("", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.complete(REQUEST))
                .isInstanceOfSatisfying(LlmException.class, e -> {
                    assertThat(e.kind()).isEqualTo(LlmException.Kind.UNAVAILABLE);
                    assertThat(e.usage()).isEqualTo(new LlmUsage(100, 10));
                });
    }

    @Test
    void 요청_한도는_장애와_구분한다() {
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));

        assertThatThrownBy(() -> client.complete(REQUEST))
                .isInstanceOfSatisfying(LlmException.class,
                        e -> assertThat(e.kind()).isEqualTo(LlmException.Kind.RATE_LIMITED));
    }

    @Test
    void 서버_오류는_장애다() {
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        assertThatThrownBy(() -> client.complete(REQUEST))
                .isInstanceOfSatisfying(LlmException.class,
                        e -> assertThat(e.kind()).isEqualTo(LlmException.Kind.UNAVAILABLE));
    }

    @Test
    void 타임아웃은_장애다() {
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(withException(new SocketTimeoutException("read timed out")));

        assertThatThrownBy(() -> client.complete(REQUEST))
                .isInstanceOfSatisfying(LlmException.class,
                        e -> assertThat(e.kind()).isEqualTo(LlmException.Kind.UNAVAILABLE));
    }

    @Test
    void 재요청이_장애로_끝나도_앞서_쓴_토큰을_넘겨준다() {
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(chat("{}", 100, 10));
        server.expect(once(), requestTo(COMPLETIONS)).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> client.complete(REQUEST))
                .isInstanceOfSatisfying(LlmException.class, e -> {
                    assertThat(e.kind()).isEqualTo(LlmException.Kind.UNAVAILABLE);
                    assertThat(e.usage()).isEqualTo(new LlmUsage(100, 10));
                });
    }

    @Test
    void 설정이_없으면_호출하지_않고_장애로_답한다() {
        OpenAiCompatibleLlmClient unconfigured = new OpenAiCompatibleLlmClient(rest, false, "", VERSIONS, 1000, JSON, VALIDATOR);

        assertThatThrownBy(() -> unconfigured.complete(REQUEST))
                .isInstanceOfSatisfying(LlmException.class,
                        e -> assertThat(e.kind()).isEqualTo(LlmException.Kind.UNAVAILABLE));
        server.verify();
    }

    @Test
    void 모델과_기능별_프롬프트_버전은_설정값이다() {
        assertThat(client.model()).isEqualTo("test-model");
        assertThat(client.promptVersion(ReviewType.ANALYSIS)).isEqualTo("analysis-v2");
        assertThat(client.promptVersion(ReviewType.CODE_REVIEW)).isEqualTo("review-v1");
    }
}
