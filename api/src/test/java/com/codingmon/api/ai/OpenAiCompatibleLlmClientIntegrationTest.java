package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import tools.jackson.databind.json.JsonMapper;

// 실제 모델 서버로 호출한다. LLM_URL과 LLM_MODEL이 없으면 건너뛴다(api/README.md).
@EnabledIfEnvironmentVariable(named = "LLM_URL", matches = ".+")
class OpenAiCompatibleLlmClientIntegrationTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();
    private static final Map<String, Object> SCHEMA = Map.of(
            "type", "object",
            "additionalProperties", false,
            "required", List.of("summary", "lines"),
            "properties", Map.of(
                    "summary", Map.of("type", "string"),
                    "lines", Map.of("type", "array", "items", Map.of("type", "integer"))));
    private static final LlmRequest<Answer> REQUEST = new LlmRequest<>(
            "제출 코드에서 틀린 원인을 쉬운 한국어로 설명한다. 정답 코드는 쓰지 않는다. 지정된 JSON 스키마로만 답한다.",
            """
                    문제: 정수 n개의 합을 출력한다.
                    판정: 런타임 에러 (IndexError)
                    제출 코드:
                    1: n = int(input())
                    2: a = list(map(int, input().split()))
                    3: total = 0
                    4: for i in range(n + 1):
                    5:     total += a[i]
                    6: print(total)
                    """,
            "answer", SCHEMA, Answer.class);

    record Answer(@NotBlank String summary, @NotEmpty List<Integer> lines) {
    }

    private static OpenAiCompatibleLlmClient client(String model) {
        return new OpenAiCompatibleLlmClient(System.getenv("LLM_URL"), "", model, "v1", Duration.ofSeconds(3),
                Duration.ofSeconds(180), 4096, JsonMapper.builder().build(), VALIDATOR);
    }

    @Test
    void 실제_모델이_스키마대로_답하고_토큰을_돌려준다() {
        LlmResponse<Answer> response = client(System.getenv("LLM_MODEL")).complete(REQUEST);

        assertThat(response.value().summary()).matches(".*[가-힣].*");
        assertThat(response.value().lines()).allSatisfy(line -> assertThat(line).isBetween(1, 6));
        assertThat(response.usage().inputTokens()).isPositive();
        assertThat(response.usage().outputTokens()).isPositive();
    }

    @Test
    void 없는_모델은_장애로_다룬다() {
        assertThatThrownBy(() -> client("no-such-model:0").complete(REQUEST))
                .isInstanceOfSatisfying(LlmException.class,
                        e -> assertThat(e.kind()).isEqualTo(LlmException.Kind.UNAVAILABLE));
    }
}
