package com.codingmon.api.judge;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.codingmon.api.Language;

// stderr·exit_code는 #66 격리 검증에서 Judge0 1.13.1이 실제로 돌려준 값이다(judge-verdict-mapping.md 8절).
class CaseJudgeTest {

    private static final CaseJudge.Limits LIMITS = new CaseJudge.Limits(262_144, 1_048_576);
    private static final String PY_KILLED = "run: line 1:     3 Killed                  /usr/local/python-3.8.1/bin/python3 script.py\n";
    private static final String CPP_ABORTED = "run: line 1:     3 Aborted                 LD_LIBRARY_PATH=/usr/local/gcc-9.2.0/lib64 ./a.out\n";

    @Test
    void 진행_중이면_기다린다() {
        assertThat(python(true, result(1, null, null, null, null))).isInstanceOf(CaseOutcome.Pending.class);
        assertThat(python(true, result(2, null, null, null, null))).isInstanceOf(CaseOutcome.Pending.class);
    }

    @Test
    void 채점_서버_오류는_다시_제출하거나_채점_불가다() {
        assertThat(python(true, result(13, null, null, null, null))).isInstanceOf(CaseOutcome.InternalError.class);
        assertThat(python(true, result(14, null, null, null, null))).isInstanceOf(CaseOutcome.JudgeError.class);
        assertThat(python(true, result(15, null, null, null, null))).isInstanceOf(CaseOutcome.JudgeError.class);
    }

    @Test
    void 정상_종료하면_출력을_비교한다() {
        assertThat(verdict(python(true, result(3, "3\n", null, 0, 9_000)))).isEqualTo(Verdict.ACCEPTED);
        assertThat(verdict(python(true, result(3, "3 \n", null, 0, 9_000)))).isEqualTo(Verdict.PRESENTATION_ERROR);
        assertThat(verdict(python(true, result(3, "4\n", null, 0, 9_000)))).isEqualTo(Verdict.WRONG_ANSWER);
        // status 4는 연동 버그지만 판정은 직접 비교한 값으로 낸다
        assertThat(verdict(python(true, result(4, "3\n", null, 0, 9_000)))).isEqualTo(Verdict.ACCEPTED);
    }

    @Test
    void 비교는_원본_바이트로_한다() {
        // 둘 다 글자로 바꾸면 U+FFFD 하나가 돼 같아 보인다
        Judge0Result result = new Judge0Result(3, new byte[] { (byte) 0xFF }, null, null, null, 9_000, 0, null);
        assertThat(verdict(CaseJudge.judge(Language.PYTHON, true, result, new byte[] { (byte) 0xFE }, LIMITS)))
                .isEqualTo(Verdict.WRONG_ANSWER);
    }

    @Test
    void 시간과_메모리를_밀리초와_KB로_남긴다() {
        Judge0Result tle = new Judge0Result(5, null, null, null, new BigDecimal("2.098"), 4_848, 0, null);
        assertThat(CaseJudge.judge(Language.CPP, false, tle, bytes(""), LIMITS))
                .isEqualTo(new CaseOutcome.Judged(Verdict.TIME_LIMIT_EXCEEDED, null, 2_098, 4_848));
    }

    @Test
    void C플러스플러스_컴파일_에러는_메시지를_남긴다() {
        String message = "main.cpp:3:1: error: expected primary-expression before '}' token\n";
        Judge0Result result = new Judge0Result(6, null, null, bytes(message), null, null, null, null);
        // 끝 줄바꿈은 Python 문법 오류 메시지와 같이 지운다
        assertThat(CaseJudge.judge(Language.CPP, true, result, bytes(""), LIMITS))
                .isEqualTo(new CaseOutcome.CompileError(message.stripTrailing(), true));
    }

    @Test
    void Python_문법_오류는_SAMPLE에서만_컴파일_에러다() {
        String stderr = "  File \"script.py\", line 2\n    \n           ^\nSyntaxError: unexpected EOF while parsing\n";
        assertThat(python(true, result(11, null, stderr, 1, 9_268))).isEqualTo(new CaseOutcome.CompileError(
                "  File \"script.py\", line 2\n    \n           ^\nSyntaxError: unexpected EOF while parsing", false));
        // HIDDEN에서 같은 모양이면 학생 코드가 꾸민 stderr로 보고 원문을 메시지로 내보내지 않는다
        assertThat(python(false, result(11, null, stderr, 1, 9_268)))
                .isEqualTo(new CaseOutcome.Judged(Verdict.RUNTIME_ERROR, RuntimeErrorType.OTHER, null, 9_268));
        String indent = "  File \"script.py\", line 2\n    print(1)\n    ^\nIndentationError: expected an indented block\n";
        assertThat(python(true, result(11, null, indent, 1, 9_868))).isInstanceOf(CaseOutcome.CompileError.class);
    }

    @Test
    void 트레이스백_안의_SyntaxError는_런타임_에러다() {
        String stderr = "Traceback (most recent call last):\n  File \"script.py\", line 1, in <module>\n    exec(\"(\")\n"
                + "  File \"<string>\", line 1\n    (\n    ^\nSyntaxError: unexpected EOF while parsing\n";
        assertThat(python(true, result(11, null, stderr, 1, 9_000)))
                .isEqualTo(new CaseOutcome.Judged(Verdict.RUNTIME_ERROR, RuntimeErrorType.OTHER, null, 9_000));
    }

    @Test
    void 출력이_한도에_닿고_비정상_종료하면_출력_초과다() {
        String full = "x".repeat(LIMITS.outputLimitBytes());
        // Python은 SIGXFSZ를 무시해 OSError(exit 1)로, stderr가 넘치면 exit 120으로 끝난다
        assertThat(verdict(python(true, result(11, full, "OSError: [Errno 27] File too large\n", 1, 10_900))))
                .isEqualTo(Verdict.OUTPUT_LIMIT_EXCEEDED);
        assertThat(verdict(python(true, result(11, null, full, 120, 10_896)))).isEqualTo(Verdict.OUTPUT_LIMIT_EXCEEDED);
        // C++은 SIGXFSZ(exit 153)로 끝난다
        assertThat(verdict(CaseJudge.judge(Language.CPP, true, result(11, "x", null, 153, 4_880), bytes(""), LIMITS)))
                .isEqualTo(Verdict.OUTPUT_LIMIT_EXCEEDED);
        // 한도만큼 정확히 쓰고 정상 종료하면 비교한다
        assertThat(verdict(CaseJudge.judge(Language.PYTHON, true, result(3, full, null, 0, 12_184), bytes(full), LIMITS)))
                .isEqualTo(Verdict.ACCEPTED);
    }

    @Test
    void SIGKILL에_메모리가_한도면_메모리_초과다() {
        assertThat(verdict(python(true, result(11, null, PY_KILLED, 137, 262_144)))).isEqualTo(Verdict.MEMORY_LIMIT_EXCEEDED);
        assertThat(verdict(CaseJudge.judge(Language.CPP, false, result(11, null, PY_KILLED, 137, 262_144), bytes(""), LIMITS)))
                .isEqualTo(Verdict.MEMORY_LIMIT_EXCEEDED);
        // 한도보다 적게 쓰고 죽었으면 메모리 초과가 아니다
        assertThat(python(true, result(11, null, PY_KILLED, 137, 100_000)))
                .isEqualTo(new CaseOutcome.Judged(Verdict.RUNTIME_ERROR, RuntimeErrorType.OTHER, null, 100_000));
    }

    @Test
    void MemoryError와_bad_alloc은_메모리_초과다() {
        String py = "Traceback (most recent call last):\n  File \"script.py\", line 1, in <module>\n    a = [0] * 10**10\nMemoryError\n";
        assertThat(verdict(python(true, result(11, null, py, 1, 9_000)))).isEqualTo(Verdict.MEMORY_LIMIT_EXCEEDED);
        String cpp = "terminate called after throwing an instance of 'std::bad_alloc'\n  what():  std::bad_alloc\n" + CPP_ABORTED;
        assertThat(verdict(CaseJudge.judge(Language.CPP, true, result(11, null, cpp, 134, 5_000), bytes(""), LIMITS)))
                .isEqualTo(Verdict.MEMORY_LIMIT_EXCEEDED);
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', textBlock = """
            IndexError: list index out of range                                   | INDEX_ERROR
            ZeroDivisionError: integer division or modulo by zero                 | ZERO_DIVISION
            ValueError: invalid literal for int() with base 10: '1 2'             | VALUE_ERROR
            NameError: name 'answer' is not defined                               | NAME_ERROR
            UnboundLocalError: local variable 'x' referenced before assignment    | NAME_ERROR
            TypeError: can only concatenate str (not "int") to str                | TYPE_ERROR
            RecursionError: maximum recursion depth exceeded in comparison        | RECURSION_ERROR
            EOFError: EOF when reading a line                                     | EOF_ERROR
            KeyError: 'k'                                                         | OTHER
            AttributeError: 'int' object has no attribute 'append'                | OTHER
            AssertionError                                                        | OTHER
            __main__.MyError: boom                                                | OTHER
            """)
    void Python_예외_이름으로_종류를_나눈다(String exceptionLine, RuntimeErrorType expected) {
        String stderr = "Traceback (most recent call last):\n  File \"script.py\", line 2, in <module>\n    f()\n" + exceptionLine + "\n";
        assertThat(python(false, result(11, null, stderr, 1, 9_700)))
                .isEqualTo(new CaseOutcome.Judged(Verdict.RUNTIME_ERROR, expected, null, 9_700));
    }

    @Test
    void 트레이스백_앞의_디버그_출력과_여러_줄_메시지는_예외_이름에_영향이_없다() {
        assertThat(CaseJudge.pythonExceptionName("debug ValueError: 이건 디버그 출력\nTraceback (most recent call last):\n"
                + "  File \"script.py\", line 4, in <module>\n    print([][0])\nIndexError: list index out of range"))
                .isEqualTo("IndexError");
        assertThat(CaseJudge.pythonExceptionName("Traceback (most recent call last):\n  File \"script.py\", line 1, in <module>\n"
                + "    raise ValueError(\"bad\\ninput\")\nValueError: bad\ninput")).isEqualTo("ValueError");
        // 트레이스백 없이 sys.exit(1)로 끝나면 이름이 없다
        assertThat(CaseJudge.pythonExceptionName("")).isNull();
        assertThat(python(false, result(11, null, null, 1, 9_540)))
                .isEqualTo(new CaseOutcome.Judged(Verdict.RUNTIME_ERROR, RuntimeErrorType.OTHER, null, 9_540));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', textBlock = """
            139 |                                                                         | INDEX_ERROR
            136 |                                                                         | ZERO_DIVISION
            134 | terminate called after throwing an instance of 'std::out_of_range'     | INDEX_ERROR
            134 | terminate called after throwing an instance of 'std::invalid_argument' | VALUE_ERROR
            134 | a.out: main.cpp:3: int main(): Assertion `1 == 2' failed.             | OTHER
            134 | terminate called after throwing an instance of 'int'                  | OTHER
            1   |                                                                         | OTHER
            """)
    void C플러스플러스는_신호와_예외_이름으로_종류를_나눈다(int exitCode, String stderr, RuntimeErrorType expected) {
        String full = (stderr == null ? "" : stderr + "\n") + CPP_ABORTED;
        assertThat(CaseJudge.judge(Language.CPP, false, result(11, null, full, exitCode, 4_900), bytes(""), LIMITS))
                .isEqualTo(new CaseOutcome.Judged(Verdict.RUNTIME_ERROR, expected, null, 4_900));
    }

    @Test
    void 신호_번호는_exit_signal_exit_code_status_순서로_읽는다() {
        assertThat(CaseJudge.signal(new Judge0Result(11, null, null, null, null, null, 0, 11))).isEqualTo(11);
        assertThat(CaseJudge.signal(result(11, null, null, 139, null))).isEqualTo(11);
        assertThat(CaseJudge.signal(result(7, null, null, null, null))).isEqualTo(11);
        assertThat(CaseJudge.signal(result(8, null, null, null, null))).isEqualTo(25);
        assertThat(CaseJudge.signal(result(9, null, null, null, null))).isEqualTo(8);
        assertThat(CaseJudge.signal(result(10, null, null, null, null))).isEqualTo(6);
        assertThat(CaseJudge.signal(result(11, null, null, 1, null))).isZero();
    }

    // 기대 출력은 "3\n"이다.
    private static CaseOutcome python(boolean sample, Judge0Result result) {
        return CaseJudge.judge(Language.PYTHON, sample, result, bytes("3\n"), LIMITS);
    }

    private static Verdict verdict(CaseOutcome outcome) {
        if (outcome instanceof CaseOutcome.Judged judged) {
            return judged.verdict();
        }
        throw new AssertionError("판정이 나지 않았다: " + outcome);
    }

    private static Judge0Result result(int status, String stdout, String stderr, Integer exitCode, Integer memoryKb) {
        return new Judge0Result(status, stdout == null ? null : bytes(stdout), stderr == null ? null : bytes(stderr), null,
                null, memoryKb, exitCode, null);
    }

    private static byte[] bytes(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }
}
