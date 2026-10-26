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
        // Python 문법 오류(fromCompiler = false)는 SAMPLE stderr로 정한 것이라 SAMPLE에서 바로 컴파일 에러로 확정한다.
        // 아래 '채점 불가' 예외를 쓰지 않아, 학생이 SAMPLE 하나에서만 문법 오류 모양을 찍어 채점 불가를 만들 수 없다.
        // 컴파일러가 낸 status 6은 다르다. 진짜 컴파일 에러는 모든 케이스에서 똑같이 나므로, 다른 케이스가 하나라도
        // 컴파일됐다면(SAMPLE이든 HIDDEN이든 판정이 났다면) 채점 VM 쪽 문제라 채점 불가다. 그래서 status 6은
        // 다른 SAMPLE 결과가 다 나올 때까지 기다린 뒤 정한다. 진짜 컴파일 에러는 모든 SAMPLE이 곧바로 status 6으로 끝나
        // 기다려도 늦어지지 않고, 결과가 도착한 순서와 상관없이 같은 판정이 난다.
        boolean compiled = cases.stream().anyMatch(c -> c.outcome() instanceof CaseOutcome.Judged);
        boolean samplePending = cases.stream().anyMatch(c -> c.sample() && c.outcome() instanceof CaseOutcome.Pending);
        boolean hasSample = cases.stream().anyMatch(Case::sample);
        for (Case c : cases) {
            if (c.sample() && c.outcome() instanceof CaseOutcome.CompileError error
                    && (!error.fromCompiler() || (!compiled && !samplePending))) {
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
                    return new JudgeError(CaseJudge.withMessage("Judge0 status 13 (Internal Error)", error.message()));
                }
                case CaseOutcome.CompileError error when error.fromCompiler() && compiled -> {
                    return new JudgeError("다른 케이스는 컴파일됐는데 컴파일러가 실패한 케이스가 있다");
                }
                // SAMPLE이 없는 실행은 컴파일 에러를 확정할 근거가 없다. 그 밖의 컴파일 에러는 SAMPLE 결과를 기다린다.
                case CaseOutcome.CompileError error when !hasSample -> {
                    return new JudgeError("SAMPLE 케이스가 없어 컴파일 에러를 확정할 수 없다");
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
