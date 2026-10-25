package com.codingmon.api.judge;

import java.util.List;

// 케이스 판정을 제출 하나(submissions)의 결과로 합친다(judge-verdict-mapping.md 제출 판정 합치기).
sealed interface SubmissionOutcome {

    // 판정이 빈 케이스가 남았다. progress = 판정이 난 케이스 ÷ 실행 대상 케이스 × 100(내림).
    record InProgress(int progress) implements SubmissionOutcome {
    }

    // verdict = 'COMPILE_ERROR', compiler_message = message. 남은 케이스 결과는 기다리지 않는다.
    record CompileError(String message) implements SubmissionOutcome {
    }

    // job_status = 'JUDGE_ERROR', verdict = NULL. 학생 탓이 아니라 시도 횟수에 넣지 않는다.
    record JudgeError(String reason) implements SubmissionOutcome {
    }

    // timeMs·memoryKb는 판정이 난 케이스 중 최댓값이다. runtimeErrorType은 RUNTIME_ERROR일 때만 있다.
    record Completed(Verdict verdict, RuntimeErrorType runtimeErrorType, Integer timeMs, Integer memoryKb)
            implements SubmissionOutcome {
    }

    // 아직 결과가 없는 케이스는 Pending으로 담는다.
    record Case(boolean sample, CaseOutcome outcome) {
    }

    // cases는 실행 대상 케이스 전부를 채점 순서(SAMPLE 먼저, 같은 종류 안에서는 ordinal 순)로 담는다.
    static SubmissionOutcome combine(List<Case> cases) {
        if (cases.isEmpty()) {
            return new JudgeError("실행할 테스트케이스가 없다");
        }
        // 진짜 컴파일 에러는 모든 케이스에서 똑같이 나므로, SAMPLE은 컴파일됐는데 어떤 케이스만 컴파일러가 실패했다면
        // (채점 VM 메모리 부족 등) 학생 코드 탓이 아니라 채점 불가다. SAMPLE끼리도, SAMPLE과 HIDDEN 사이도 같다.
        // HIDDEN의 Judged는 컴파일 성공으로 세지 않는다. Python 문법 오류는 HIDDEN에서 런타임 에러로 오기 때문이다.
        // Python 문법 오류(fromCompiler = false)는 이 규칙에서 뺀다. 학생이 stderr로 채점 불가를 만들 수 없게 한다.
        boolean sampleCompiled = cases.stream().anyMatch(c -> c.sample() && c.outcome() instanceof CaseOutcome.Judged);
        boolean hasSample = cases.stream().anyMatch(Case::sample);
        for (Case c : cases) {
            if (c.sample() && c.outcome() instanceof CaseOutcome.CompileError error
                    && !(error.fromCompiler() && sampleCompiled)) {
                return new CompileError(error.message());
            }
        }
        int judged = 0;
        for (Case c : cases) {
            switch (c.outcome()) {
                case CaseOutcome.JudgeError error -> {
                    return new JudgeError(error.reason());
                }
                // 처리기가 다시 제출하지 않고 넘겼다면 채점 불가로 본다.
                case CaseOutcome.InternalError error -> {
                    return new JudgeError("Judge0 status 13 (Internal Error)");
                }
                // HIDDEN의 컴파일 에러는 SAMPLE 결과가 아직이면 기다린다. SAMPLE이 없는 실행은 컴파일 에러를 확정할 근거가 없다.
                case CaseOutcome.CompileError error when sampleCompiled || !hasSample -> {
                    return new JudgeError("SAMPLE은 컴파일됐는데 컴파일러가 실패한 케이스가 있다");
                }
                case CaseOutcome.Judged j -> judged++;
                default -> {
                }
            }
        }
        if (judged < cases.size()) {
            return new InProgress(judged * 100 / cases.size());
        }
        CaseOutcome.Judged decisive = null;
        Integer timeMs = null;
        Integer memoryKb = null;
        for (Case c : cases) {
            CaseOutcome.Judged j = (CaseOutcome.Judged) c.outcome();
            if (decisive == null && j.verdict() != Verdict.ACCEPTED) {
                decisive = j;
            }
            timeMs = max(timeMs, j.timeMs());
            memoryKb = max(memoryKb, j.memoryKb());
        }
        return decisive == null ? new Completed(Verdict.ACCEPTED, null, timeMs, memoryKb)
                : new Completed(decisive.verdict(), decisive.errorType(), timeMs, memoryKb);
    }

    // 삼항 연산자로 쓰면 Math.max의 int 때문에 식 전체가 int가 돼 null인 b까지 언박싱한다.
    private static Integer max(Integer a, Integer b) {
        if (a == null) {
            return b;
        }
        if (b == null) {
            return a;
        }
        return Math.max(a, b);
    }
}
