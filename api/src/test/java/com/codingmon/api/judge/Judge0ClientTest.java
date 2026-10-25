package com.codingmon.api.judge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpResponse;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.ResponseCreator;
import org.springframework.web.client.RestClient;

import com.codingmon.api.Language;

class Judge0ClientTest {

    private static final String BATCH = "http://judge0.test/submissions/batch";
    private static final String SUBMIT = BATCH + "?base64_encoded=true";

    private MockRestServiceServer server;
    private Judge0Client client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://judge0.test").defaultHeader("X-Auth-Token", "t");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new Judge0Client(builder.build(), true, Duration.ZERO);
    }

    @Test
    void 제한값은_문제_설정으로만_만든다() {
        server.expect(once(), requestTo(SUBMIT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Auth-Token", "t"))
                .andExpect(jsonPath("$.submissions[0].language_id").value(71))
                .andExpect(jsonPath("$.submissions[0].source_code").value(b64("print(input())")))
                .andExpect(jsonPath("$.submissions[1].stdin").value(b64("2\n")))
                .andExpect(jsonPath("$.submissions[0].cpu_time_limit").value(2.0))
                .andExpect(jsonPath("$.submissions[0].wall_time_limit").value(5.0))
                .andExpect(jsonPath("$.submissions[0].memory_limit").value(262_144))
                .andExpect(jsonPath("$.submissions[0].stack_limit").value(262_144))
                .andExpect(jsonPath("$.submissions[0].max_file_size").value(1024))
                .andExpect(jsonPath("$.submissions[0].compiler_options").doesNotExist())
                .andExpect(jsonPath("$.submissions[0].enable_network").doesNotExist())
                .andExpect(jsonPath("$.submissions[0].expected_output").doesNotExist())
                .andRespond(created("[{\"token\":\"a\"},{\"token\":\"b\"}]"));

        assertThat(client.submit(Language.PYTHON, "print(input())", 2_000, 256, List.of("1\n", "2\n"))).containsExactly("a", "b");
        server.verify();
    }

    @Test
    void C플러스플러스는_컴파일_옵션을_고정해_보내고_wall_시간은_상한까지만_늘린다() {
        server.expect(requestTo(SUBMIT))
                .andExpect(jsonPath("$.submissions[0].language_id").value(54))
                .andExpect(jsonPath("$.submissions[0].compiler_options").value("-O2 -std=c++17"))
                .andExpect(jsonPath("$.submissions[0].cpu_time_limit").value(20.0))
                .andExpect(jsonPath("$.submissions[0].wall_time_limit").value(30))
                .andRespond(created("[{\"token\":\"a\"}]"));

        client.submit(Language.CPP, "int main(){}", 20_000, 256, List.of(""));
        server.verify();
    }

    @Test
    void 묶음에서_한_항목이라도_거절되면_채점_불가다() {
        server.expect(requestTo(SUBMIT))
                .andRespond(created("[{\"token\":\"a\"},{\"memory_limit\":[\"must be less than or equal to 524288\"]}]"));

        assertThatThrownBy(() -> client.submit(Language.PYTHON, "x", 1_000, 256, List.of("", "")))
                .isInstanceOf(Judge0Exception.class);
    }

    @Test
    void 큐가_차면_다시_보낸다() {
        server.expect(once(), requestTo(SUBMIT)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        server.expect(once(), requestTo(SUBMIT)).andRespond(created("[{\"token\":\"a\"}]"));

        assertThat(client.submit(Language.PYTHON, "x", 1_000, 256, List.of(""))).containsExactly("a");
        server.verify();
    }

    @Test
    void 들어갔을_수_있는_제출과_인증_오류는_다시_보내지_않는다() {
        server.expect(once(), requestTo(SUBMIT)).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));
        assertThatThrownBy(() -> client.submit(Language.PYTHON, "x", 1_000, 256, List.of(""))).isInstanceOf(Judge0Exception.class);
        server.verify();

        server.reset();
        server.expect(once(), requestTo(SUBMIT)).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        assertThatThrownBy(() -> client.submit(Language.PYTHON, "x", 1_000, 256, List.of(""))).isInstanceOf(Judge0Exception.class);
        server.verify();
    }

    @Test
    void 큐가_오래_차_있어도_기다린다() {
        for (int i = 0; i < 6; i++) {
            server.expect(once(), requestTo(SUBMIT)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        }
        server.expect(once(), requestTo(SUBMIT)).andRespond(created("[{\"token\":\"a\"}]"));

        assertThat(client.submit(Language.PYTHON, "x", 1_000, 256, List.of(""))).containsExactly("a");
        server.verify();
    }

    @Test
    void 연결_거부면_제출도_다시_보내고_읽기_타임아웃이면_다시_보내지_않는다() {
        // 연결 거부는 요청이 서버에 닿지 않은 것이다
        server.expect(once(), requestTo(SUBMIT)).andRespond(withException(new ConnectException("Connection refused")));
        server.expect(once(), requestTo(SUBMIT)).andRespond(created("[{\"token\":\"a\"}]"));
        assertThat(client.submit(Language.PYTHON, "x", 1_000, 256, List.of(""))).containsExactly("a");
        server.verify();

        // 읽기 타임아웃은 이미 들어갔을 수 있다
        server.reset();
        server.expect(once(), requestTo(SUBMIT)).andRespond(withException(new SocketTimeoutException("Read timed out")));
        assertThatThrownBy(() -> client.submit(Language.PYTHON, "x", 1_000, 256, List.of(""))).isInstanceOf(Judge0Exception.class);
        server.verify();
    }

    @Test
    void 결과_조회는_타임아웃과_본문_읽기_중_끊김을_다시_묻는다() {
        server.expect(once(), requestTo(Matchers.startsWith(BATCH))).andRespond(withException(new SocketTimeoutException("Read timed out")));
        // 헤더를 받은 뒤 본문을 읽다 끊긴다. Spring은 이를 일반 RestClientException으로 감싼다
        server.expect(once(), requestTo(Matchers.startsWith(BATCH))).andRespond(request -> {
            MockClientHttpResponse response = new MockClientHttpResponse(new InputStream() {
                @Override
                public int read() throws IOException {
                    throw new SocketTimeoutException("Read timed out");
                }
            }, HttpStatus.OK);
            response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
            return response;
        });
        server.expect(once(), requestTo(Matchers.startsWith(BATCH)))
                .andRespond(withSuccess(processing(List.of("a")), MediaType.APPLICATION_JSON));

        assertThat(client.fetch(List.of("a"))).containsOnlyKeys("a");
        server.verify();
    }

    @Test
    void 결과의_base64를_원본_바이트로_푼다() {
        // Judge0는 base64를 60자마다 줄바꿈해 준다
        String longOut = "0123456789".repeat(10);
        String wrapped = Base64.getMimeEncoder(60, "\n".getBytes(StandardCharsets.UTF_8))
                .encodeToString(longOut.getBytes(StandardCharsets.UTF_8)).replace("\n", "\\n");
        server.expect(requestTo(Matchers.startsWith(BATCH)))
                .andExpect(method(HttpMethod.GET))
                .andExpect(queryParam("tokens", "a,b"))
                .andExpect(queryParam("base64_encoded", "true"))
                .andExpect(queryParam("fields", Matchers.containsString("exit_code")))
                .andRespond(withSuccess("""
                        {"submissions":[
                          {"token":"a","status":{"id":3,"description":"Accepted"},"stdout":"%s","stderr":null,
                           "compile_output":null,"time":"0.028","memory":9716,"exit_code":0,"exit_signal":null},
                          {"token":"b","status":{"id":6,"description":"Compilation Error"},"stdout":null,"stderr":null,
                           "compile_output":"%s","message":"%s","time":null,"memory":null,"exit_code":null,"exit_signal":null}
                        ]}""".formatted(wrapped, b64("main.cpp:3:1: error"), b64("Exited with error status 1")), MediaType.APPLICATION_JSON));

        Map<String, Judge0Result> results = client.fetch(List.of("a", "b"));

        Judge0Result a = results.get("a");
        assertThat(a.statusId()).isEqualTo(3);
        assertThat(new String(a.stdout(), StandardCharsets.UTF_8)).isEqualTo(longOut);
        assertThat(a.stderr()).isNull();
        assertThat(a.time()).isEqualByComparingTo(new BigDecimal("0.028"));
        assertThat(a.memoryKb()).isEqualTo(9_716);
        assertThat(a.exitCode()).isZero();
        Judge0Result b = results.get("b");
        assertThat(new String(b.compileOutput(), StandardCharsets.UTF_8)).isEqualTo("main.cpp:3:1: error");
        assertThat(b.time()).isNull();
        assertThat(b.exitCode()).isNull();
        assertThat(b.message()).isEqualTo("Exited with error status 1");
        assertThat(a.message()).isNull();
    }

    @Test
    void 결과_조회는_5xx를_다시_묻고_20개씩_나눠_묻는다() {
        List<String> tokens = IntStream.range(0, 25).mapToObj(i -> "t" + i).toList();
        server.expect(once(), requestTo(Matchers.startsWith(BATCH))).andRespond(withStatus(HttpStatus.BAD_GATEWAY));
        server.expect(once(), requestTo(Matchers.startsWith(BATCH)))
                .andRespond(withSuccess(processing(tokens.subList(0, 20)), MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo(Matchers.startsWith(BATCH)))
                .andRespond(withSuccess(processing(tokens.subList(20, 25)), MediaType.APPLICATION_JSON));

        assertThat(client.fetch(tokens)).hasSize(25).allSatisfy((token, result) -> assertThat(result.statusId()).isEqualTo(2));
        server.verify();
    }

    @Test
    void 채점_서버에_없는_토큰은_채점_불가다() {
        server.expect(once(), requestTo(Matchers.startsWith(BATCH)))
                .andRespond(withSuccess("{\"submissions\":[null]}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.fetch(List.of("gone"))).isInstanceOf(Judge0Exception.class);

        server.reset();
        server.expect(once(), requestTo(Matchers.startsWith(BATCH))).andRespond(withStatus(HttpStatus.NOT_FOUND));
        assertThatThrownBy(() -> client.fetch(List.of("gone"))).isInstanceOf(Judge0Exception.class);
        server.verify();
    }

    @Test
    void 한_번에_20개를_넘게_보내지_않는다() {
        List<String> stdins = IntStream.range(0, 21).mapToObj(i -> "").toList();
        assertThatThrownBy(() -> client.submit(Language.PYTHON, "x", 1_000, 256, stdins))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static String processing(List<String> tokens) {
        return tokens.stream().map(t -> "{\"token\":\"" + t + "\",\"status\":{\"id\":2,\"description\":\"Processing\"}}")
                .collect(Collectors.joining(",", "{\"submissions\":[", "]}"));
    }

    private static ResponseCreator created(String body) {
        return withStatus(HttpStatus.CREATED).contentType(MediaType.APPLICATION_JSON).body(body);
    }

    private static String b64(String text) {
        return Base64.getEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8));
    }
}
