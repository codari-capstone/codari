package com.codingmon.api.judge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import com.codingmon.api.Language;

// 실제 PostgreSQL과 Judge0로 제출을 끝까지 채점한다. JUDGE0_URL이 없으면 건너뛴다(api/README.md).
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "JUDGE0_URL", matches = ".+")
class JudgeWorkerIntegrationTest {

    private static final String PY_SUM = "a, b = map(int, input().split())\nprint(a + b)\n";
    private static final String CPP_SUM = "#include <iostream>\nint main() { long long a, b; std::cin >> a >> b; std::cout << a + b << '\\n'; }\n";

    @Autowired
    JdbcClient jdbc;

    @Autowired
    JudgeWorker worker;

    @Autowired
    Judge0Client judge0;

    @Autowired
    WebApplicationContext context;

    long userId;
    long problemId;
    long versionId;
    List<Long> caseIds;

    @BeforeEach
    void setUp() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        userId = jdbc.sql("insert into users (email, nickname) values (:email, :nickname) returning id")
                .param("email", "judge-" + suffix + "@test.local").param("nickname", "judge-" + suffix)
                .query(Long.class).single();
        problemId = jdbc.sql("insert into problems (slug) values (:slug) returning id").param("slug", "judge-" + suffix)
                .query(Long.class).single();
        versionId = jdbc.sql("insert into problem_versions (problem_id, version_no, title, difficulty, statement_markdown,"
                + " input_description, output_description, status, published_at)"
                + " values (:problemId, 1, 'A+B', 'EASY', '두 수를 더한다', 'a b', 'a+b', 'PUBLISHED', now()) returning id")
                .param("problemId", problemId).query(Long.class).single();
        for (Language language : Language.values()) {
            jdbc.sql("insert into problem_language_configs (problem_version_id, language, time_limit_ms, memory_limit_mb)"
                    + " values (:versionId, :language, 1000, 256)")
                    .param("versionId", versionId).param("language", language.name()).update();
        }
        // SAMPLE과 HIDDEN을 섞어 번호를 매겨, 채점이 SAMPLE부터 도는지 확인한다.
        caseIds = List.of(
                testCase(1, "SAMPLE", "1 2\n", "3\n"),
                testCase(2, "HIDDEN", "100 200\n", "300\n"),
                testCase(3, "SAMPLE", "5 7\n", "12\n"),
                testCase(4, "HIDDEN", "-1 1\n", "0\n"));
    }

    @AfterEach
    void tearDown() {
        // 사용자를 지우면 제출·케이스 결과·풀이 통계가 함께 지워진다.
        jdbc.sql("delete from users where id = :id").param("id", userId).update();
        jdbc.sql("delete from problem_versions where id = :id").param("id", versionId).update();
        jdbc.sql("delete from problems where id = :id").param("id", problemId).update();
    }

    @Test
    void Python_제출을_판정한다() {
        long accepted = queue("SUBMIT", Language.PYTHON, PY_SUM);
        long wrong = queue("SUBMIT", Language.PYTHON, "a, b = map(int, input().split())\nprint(a - b)\n");
        long timeout = queue("SUBMIT", Language.PYTHON, "while True:\n    pass\n");
        // 비공개 케이스(-1 1)에서만 터진다
        long hiddenError = queue("SUBMIT", Language.PYTHON, "a, b = map(int, input().split())\nprint(a + b if a >= 0 else [][0])\n");
        long syntax = queue("SUBMIT", Language.PYTHON, "print(\n");

        assertThat(await(accepted)).containsEntry("job_status", "COMPLETED").containsEntry("verdict", "ACCEPTED")
                .containsEntry("progress", 100);
        assertThat(await(wrong)).containsEntry("verdict", "WRONG_ANSWER");
        assertThat(await(timeout)).containsEntry("verdict", "TIME_LIMIT_EXCEEDED");
        assertThat(await(hiddenError)).containsEntry("verdict", "RUNTIME_ERROR").containsEntry("runtime_error_type", "INDEX_ERROR");
        // 비공개 케이스의 출력 원문은 남기지 않는다
        assertThat(jdbc.sql("select count(*) from submission_test_results r join test_cases c on c.id = r.test_case_id"
                + " where r.submission_id = :id and c.case_type = 'HIDDEN' and (r.stdout is not null or r.stderr is not null)")
                .param("id", hiddenError).query(Long.class).single()).isZero();
        Map<String, Object> compile = await(syntax);
        assertThat(compile).containsEntry("verdict", "COMPILE_ERROR");
        // 줄 번호가 들어 있다(RES-05). 괄호를 닫지 않으면 파일 끝인 2번째 줄을 가리킨다
        assertThat((String) compile.get("compiler_message")).contains("line 2").contains("SyntaxError");
        // 예제에서 컴파일 에러가 나면 비공개 케이스는 보내지 않는다
        assertThat(resultRows(syntax)).isEqualTo(2);
        assertThat(jdbc.sql("select solved from user_problem_stats where user_id = :userId and problem_id = :problemId")
                .param("userId", userId).param("problemId", problemId).query(Boolean.class).single()).isTrue();
    }

    @Test
    void C플러스플러스를_판정한다() {
        long accepted = queue("SUBMIT", Language.CPP, CPP_SUM);
        long compile = queue("SUBMIT", Language.CPP, "int main() {\n  return 0\n}\n");
        long segfault = queue("SUBMIT", Language.CPP, "int main() { int *p = nullptr; *p = 1; }\n");

        assertThat(await(accepted)).containsEntry("verdict", "ACCEPTED");
        Map<String, Object> compileError = await(compile);
        assertThat(compileError).containsEntry("verdict", "COMPILE_ERROR");
        assertThat((String) compileError.get("compiler_message")).contains("main.cpp:2");
        assertThat(await(segfault)).containsEntry("verdict", "RUNTIME_ERROR").containsEntry("runtime_error_type", "INDEX_ERROR");
    }

    @Test
    void 예제_실행은_SAMPLE만_돌리고_원문을_남기며_통계에_넣지_않는다() {
        long accepted = queue("SAMPLE_RUN", Language.PYTHON, PY_SUM);
        long error = queue("SAMPLE_RUN", Language.PYTHON, "print(1 // 0)\n");

        assertThat(await(accepted)).containsEntry("verdict", "ACCEPTED");
        assertThat(jdbc.sql("select r.stdout from submission_test_results r join test_cases c on c.id = r.test_case_id"
                + " where r.submission_id = :id order by c.ordinal").param("id", accepted).query(String.class).list())
                .containsExactly("3\n", "12\n");
        assertThat(await(error)).containsEntry("verdict", "RUNTIME_ERROR").containsEntry("runtime_error_type", "ZERO_DIVISION");
        assertThat(jdbc.sql("select stderr from submission_test_results where submission_id = :id").param("id", error)
                .query(String.class).list()).allSatisfy(stderr -> assertThat(stderr).contains("line 1").contains("ZeroDivisionError"));
        assertThat(resultRows(error)).isEqualTo(2);
        assertThat(jdbc.sql("select count(*) from user_problem_stats where user_id = :id").param("id", userId)
                .query(Long.class).single()).isZero();
    }

    @Test
    void API로_낸_제출과_예제_실행이_채점돼_결과_API에_나온다() throws Exception {
        MockMvc mvc = MockMvcBuilders.webAppContextSetup(context).apply(SecurityMockMvcConfigurers.springSecurity()).build();
        String body = "{\"problemId\":%d,\"language\":\"%s\",\"sourceCode\":\"%s\"}";
        String python = PY_SUM.replace("\n", "\\n");
        String cpp = CPP_SUM.replace("\\", "\\\\").replace("\n", "\\n").replace("\"", "\\\"");

        long submission = id(mvc.perform(post("/api/submissions").with(user()).contentType(MediaType.APPLICATION_JSON)
                .content(body.formatted(problemId, "PYTHON", python))).andExpect(status().isAccepted()).andReturn());
        long sampleRun = id(mvc.perform(post("/api/sample-runs").with(user()).contentType(MediaType.APPLICATION_JSON)
                .content(body.formatted(problemId, "CPP", cpp))).andExpect(status().isAccepted()).andReturn());
        await(submission);
        await(sampleRun);

        mvc.perform(get("/api/submissions/" + submission).with(user()))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.verdict").value("ACCEPTED"))
                .andExpect(jsonPath("$.progress").value(100))
                .andExpect(jsonPath("$.executionTimeMs").isNumber());
        mvc.perform(get("/api/sample-runs/" + sampleRun).with(user()))
                .andExpect(jsonPath("$.verdict").value("ACCEPTED"))
                .andExpect(jsonPath("$.cases.length()").value(2))
                .andExpect(jsonPath("$.cases[0].actualOutput").value("3\n"))
                .andExpect(jsonPath("$.cases[1].verdict").value("ACCEPTED"));
    }

    @Test
    void 재시작하면_저장된_토큰으로_이어서_처리하고_토큰_없는_케이스는_채점_불가로_끝낸다() {
        long resumed = insert("SUBMIT", Language.PYTHON, PY_SUM, "RUNNING");
        List<String> inputs = jdbc.sql("select input_data from test_cases where problem_version_id = :id order by ordinal")
                .param("id", versionId).query(String.class).list();
        List<String> tokens = judge0.submit(Language.PYTHON, PY_SUM, 1000, 256, inputs);
        for (int i = 0; i < caseIds.size(); i++) {
            jdbc.sql("insert into submission_test_results (submission_id, problem_version_id, test_case_id, judge_token)"
                    + " values (:s, :v, :t, :token)")
                    .param("s", resumed).param("v", versionId).param("t", caseIds.get(i)).param("token", tokens.get(i)).update();
        }
        long lost = insert("SUBMIT", Language.PYTHON, PY_SUM, "RUNNING");
        jdbc.sql("insert into submission_test_results (submission_id, problem_version_id, test_case_id) values (:s, :v, :t)")
                .param("s", lost).param("v", versionId).param("t", caseIds.getFirst()).update();

        worker.start();

        assertThat(await(resumed)).containsEntry("verdict", "ACCEPTED");
        assertThat(await(lost)).containsEntry("job_status", "JUDGE_ERROR").containsEntry("verdict", null);
    }

    // 토큰 서명·버전 확인은 건너뛰고 이 사용자로 로그인한 것으로 본다.
    private RequestPostProcessor user() {
        return SecurityMockMvcRequestPostProcessors.jwt().jwt(jwt -> jwt.subject(String.valueOf(userId)));
    }

    private static long id(MvcResult result) throws Exception {
        Matcher matcher = Pattern.compile("\"id\":(\\d+)").matcher(result.getResponse().getContentAsString());
        assertThat(matcher.find()).isTrue();
        return Long.parseLong(matcher.group(1));
    }

    private long testCase(int ordinal, String type, String input, String expected) {
        return jdbc.sql("insert into test_cases (problem_version_id, ordinal, case_type, input_data, expected_output)"
                + " values (:versionId, :ordinal, :type, :input, :expected) returning id")
                .param("versionId", versionId).param("ordinal", ordinal).param("type", type)
                .param("input", input).param("expected", expected)
                .query(Long.class).single();
    }

    private long queue(String kind, Language language, String source) {
        long id = insert(kind, language, source, "QUEUED");
        worker.wake();
        return id;
    }

    private long insert(String kind, Language language, String source, String status) {
        return jdbc.sql("insert into submissions (user_id, problem_version_id, submission_kind, language, source_code, job_status)"
                + " values (:userId, :versionId, :kind, :language, :source, :status) returning id")
                .param("userId", userId).param("versionId", versionId).param("kind", kind)
                .param("language", language.name()).param("source", source).param("status", status)
                .query(Long.class).single();
    }

    private long resultRows(long submissionId) {
        return jdbc.sql("select count(*) from submission_test_results where submission_id = :id").param("id", submissionId)
                .query(Long.class).single();
    }

    // 맥 Judge0는 Rosetta로 돌아 느리다. 넉넉히 기다린다.
    private Map<String, Object> await(long submissionId) {
        Instant deadline = Instant.now().plus(Duration.ofMinutes(3));
        while (Instant.now().isBefore(deadline)) {
            Map<String, Object> row = jdbc.sql("select job_status, verdict, runtime_error_type, compiler_message, progress"
                    + " from submissions where id = :id").param("id", submissionId).query().singleRow();
            if ("COMPLETED".equals(row.get("job_status")) || "JUDGE_ERROR".equals(row.get("job_status"))) {
                return row;
            }
            try {
                Thread.sleep(300);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new AssertionError(e);
            }
        }
        throw new AssertionError("제출 " + submissionId + "이 끝나지 않았다");
    }
}
