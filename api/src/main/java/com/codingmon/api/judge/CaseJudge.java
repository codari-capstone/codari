package com.codingmon.api.judge;

import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.codingmon.api.Language;

// 테스트케이스 하나의 Judge0 결과 → 판정(judge-verdict-mapping.md 3절). 위에서부터 처음 맞는 규칙을 쓴다.
// HTTP 오류·폴링 기한 초과(1번)는 Judge0Client와 채점 처리기가 다룬다.
final class CaseJudge {

    private static final Logger log = LoggerFactory.getLogger(CaseJudge.class);

    // 요청에 보낸 제한값. outputLimitBytes = max_file_size(KB) × 1024.
    record Limits(int memoryLimitKb, int outputLimitBytes) {
    }

    // 실행 도중 비정상 종료한 status. 8(SIGXFSZ)은 그 전에 출력 초과로 걸러진다.
    private static final Set<Integer> RUNTIME_STATUSES = Set.of(7, 9, 10, 11, 12);

    private static final String TRACEBACK = "Traceback (most recent call last):";
    private static final Pattern PYTHON_SYNTAX_ERROR = Pattern.compile("^(SyntaxError|IndentationError|TabError)(:|$)");
    private static final Pattern PYTHON_EXCEPTION = Pattern.compile("^([A-Za-z_][\\w.]*)(:|$)");

    private static final Map<String, RuntimeErrorType> PYTHON_ERRORS = Map.of(
            "IndexError", RuntimeErrorType.INDEX_ERROR,
            "ZeroDivisionError", RuntimeErrorType.ZERO_DIVISION,
            "ValueError", RuntimeErrorType.VALUE_ERROR,
            "NameError", RuntimeErrorType.NAME_ERROR,
            "UnboundLocalError", RuntimeErrorType.NAME_ERROR,
            "TypeError", RuntimeErrorType.TYPE_ERROR,
            "RecursionError", RuntimeErrorType.RECURSION_ERROR,
            "EOFError", RuntimeErrorType.EOF_ERROR);

    private CaseJudge() {
    }

    static CaseOutcome judge(Language language, boolean sample, Judge0Result result, byte[] expectedOutput, Limits limits) {
        int status = result.statusId();
        if (status == 1 || status == 2) {
            return new CaseOutcome.Pending();
        }
        if (status == 13) {
            return new CaseOutcome.InternalError(result.message());
        }
        if (status == 14) {
            return new CaseOutcome.JudgeError("Judge0 status 14 (Exec Format Error): " + result.message());
        }
        if (status == 6) {
            // Python 문법 오류(아래)와 같이 끝 줄바꿈을 지워, 언어와 상관없이 메시지 모양을 맞춘다.
            return new CaseOutcome.CompileError(StoredText.of(StoredText.decode(result.compileOutput()).stripTrailing()));
        }
        String stderr = StoredText.withoutJudgeLines(StoredText.decode(result.stderr()));
        // Python은 컴파일 단계가 없어 문법 오류도 실행 중 status 11로 온다. 진짜 문법 오류는 입력과 상관없이
        // 모든 케이스에서 나므로 SAMPLE에서 확정한다. HIDDEN에서 같은 모양이면 학생 코드가 stderr를 꾸민 것이라
        // 컴파일 메시지로 공개하지 않는다. 공개하면 비공개 입력을 메시지에 실어 빼낼 수 있다(6번).
        if (language == Language.PYTHON && sample && status == 11 && isPythonSyntaxError(stderr)) {
            return new CaseOutcome.CompileError(StoredText.of(stderr));
        }
        if (status == 5) {
            return judged(Verdict.TIME_LIMIT_EXCEEDED, null, result);
        }
        int signal = signal(result);
        // 정상 종료(status 3)는 길이로 보지 않는다. 한도만큼 정확히 쓰고 끝난 출력은 비교로 넘긴다(8번).
        boolean overflowed = status != 3 && (length(result.stdout()) >= limits.outputLimitBytes()
                || length(result.stderr()) >= limits.outputLimitBytes());
        if (overflowed || status == 8 || signal == 25) {
            return judged(Verdict.OUTPUT_LIMIT_EXCEEDED, null, result);
        }
        // Judge0에는 메모리 초과 status가 없다. cgroup 한도에 걸리면 SIGKILL로 끝나고 memory가 한도와 같다(2절 2번).
        if (signal == 9 && result.memoryKb() != null && result.memoryKb() >= limits.memoryLimitKb()) {
            return judged(Verdict.MEMORY_LIMIT_EXCEEDED, null, result);
        }
        if (RUNTIME_STATUSES.contains(status)) {
            String exception = language == Language.PYTHON ? pythonExceptionName(stderr) : null;
            if ("MemoryError".equals(exception) || (language == Language.CPP && stderr.contains("std::bad_alloc"))) {
                return judged(Verdict.MEMORY_LIMIT_EXCEEDED, null, result);
            }
            if (signal == 9) {
                log.warn("신호 9인데 memory {}KB가 한도 {}KB보다 작다. 런타임 에러(기타)로 둔다", result.memoryKb(),
                        limits.memoryLimitKb());
            }
            return judged(Verdict.RUNTIME_ERROR, runtimeErrorType(language, exception, signal, stderr), result);
        }
        if (status == 3 || status == 4) {
            if (status == 4) {
                // expected_output을 보내지 않으므로 Judge0가 비교했다면 연동 버그다. 판정은 직접 비교한 값으로 낸다.
                log.warn("Judge0 status 4를 받았다. 요청에 expected_output이 들어갔는지 확인한다");
            }
            return judged(OutputComparator.compare(result.stdout(), expectedOutput), null, result);
        }
        return new CaseOutcome.JudgeError("알 수 없는 Judge0 status " + status + ": " + result.message());
    }

    // 신호는 status가 아니라 exit_code(128 + 신호 번호)로 온다. Judge0가 프로그램을 bash 스크립트로 감싸 실행하기 때문이다.
    // 신호가 없으면 0이다(2절 1번).
    static int signal(Judge0Result result) {
        if (result.exitSignal() != null) {
            return result.exitSignal();
        }
        if (result.exitCode() != null && result.exitCode() > 128) {
            return result.exitCode() - 128;
        }
        return switch (result.statusId()) {
            case 7 -> 11;
            case 8 -> 25;
            case 9 -> 8;
            case 10 -> 6;
            default -> 0;
        };
    }

    static boolean isPythonSyntaxError(String stderr) {
        List<String> lines = stderr.lines().toList();
        return !lines.isEmpty() && !lines.contains(TRACEBACK) && PYTHON_SYNTAX_ERROR.matcher(lines.getLast()).find();
    }

    // 마지막 트레이스백 머리줄 다음의, 들여쓰지 않은 첫 줄이 예외 줄이다(5절). 머리줄 앞의 디버그 출력은 보지 않는다.
    // stderr의 마지막 줄을 읽으면 메시지에 줄바꿈이 든 예외(ValueError("bad\ninput"))에서 메시지 둘째 줄을 읽게 된다.
    static String pythonExceptionName(String stderr) {
        List<String> lines = stderr.lines().toList();
        int header = lines.lastIndexOf(TRACEBACK);
        if (header < 0) {
            return null;
        }
        for (String line : lines.subList(header + 1, lines.size())) {
            if (line.isEmpty() || Character.isWhitespace(line.charAt(0))) {
                continue;
            }
            Matcher matcher = PYTHON_EXCEPTION.matcher(line);
            if (!matcher.find()) {
                return null;
            }
            String name = matcher.group(1);
            return name.substring(name.lastIndexOf('.') + 1);
        }
        return null;
    }

    static RuntimeErrorType runtimeErrorType(Language language, String exception, int signal, String stderr) {
        if (language == Language.PYTHON) {
            return exception == null ? RuntimeErrorType.OTHER : PYTHON_ERRORS.getOrDefault(exception, RuntimeErrorType.OTHER);
        }
        return switch (signal) {
            case 11 -> RuntimeErrorType.INDEX_ERROR;
            case 8 -> RuntimeErrorType.ZERO_DIVISION;
            case 6 -> stderr.contains("std::out_of_range") ? RuntimeErrorType.INDEX_ERROR
                    : stderr.contains("std::invalid_argument") ? RuntimeErrorType.VALUE_ERROR : RuntimeErrorType.OTHER;
            default -> RuntimeErrorType.OTHER;
        };
    }

    private static CaseOutcome judged(Verdict verdict, RuntimeErrorType errorType, Judge0Result result) {
        Integer timeMs = result.time() == null ? null
                : result.time().movePointRight(3).setScale(0, RoundingMode.HALF_UP).intValueExact();
        return new CaseOutcome.Judged(verdict, errorType, timeMs, result.memoryKb());
    }

    private static int length(byte[] bytes) {
        return bytes == null ? 0 : bytes.length;
    }
}
