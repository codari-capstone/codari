package com.codingmon.api.judge;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

class SubmissionOutcomeTest {

    private static final CaseOutcome PENDING = new CaseOutcome.Pending();

    @Test
    void 모두_맞으면_정답이고_시간과_메모리는_최댓값이다() {
        assertThat(SubmissionOutcome.combine(List.of(
                sample(judged(Verdict.ACCEPTED, 12, 9_000)),
                hidden(judged(Verdict.ACCEPTED, 40, 8_000)),
                hidden(new CaseOutcome.Judged(Verdict.ACCEPTED, null, null, 9_500)))))
                .isEqualTo(new SubmissionOutcome.Completed(Verdict.ACCEPTED, null, 40, 9_500));
    }

    @Test
    void 시간이나_메모리가_빈_케이스가_먼저_와도_합친다() {
        assertThat(SubmissionOutcome.combine(List.of(
                sample(new CaseOutcome.Judged(Verdict.ACCEPTED, null, null, null)),
                hidden(judged(Verdict.ACCEPTED, 30, 9_000)))))
                .isEqualTo(new SubmissionOutcome.Completed(Verdict.ACCEPTED, null, 30, 9_000));
        assertThat(SubmissionOutcome.combine(List.of(sample(new CaseOutcome.Judged(Verdict.ACCEPTED, null, null, null)))))
                .isEqualTo(new SubmissionOutcome.Completed(Verdict.ACCEPTED, null, null, null));
    }

    @Test
    void 채점_순서상_처음_틀린_케이스가_판정을_낸다() {
        assertThat(SubmissionOutcome.combine(List.of(
                sample(judged(Verdict.ACCEPTED, 10, 9_000)),
                hidden(new CaseOutcome.Judged(Verdict.RUNTIME_ERROR, RuntimeErrorType.INDEX_ERROR, 20, 9_100)),
                hidden(judged(Verdict.TIME_LIMIT_EXCEEDED, 2_100, 9_200)))))
                .isEqualTo(new SubmissionOutcome.Completed(Verdict.RUNTIME_ERROR, RuntimeErrorType.INDEX_ERROR, 2_100, 9_200));
    }

    @Test
    void 판정이_빈_케이스가_있으면_진행률만_낸다() {
        assertThat(SubmissionOutcome.combine(List.of(
                sample(judged(Verdict.WRONG_ANSWER, 10, 9_000)), hidden(PENDING), hidden(PENDING))))
                .isEqualTo(new SubmissionOutcome.InProgress(33));
    }

    @Test
    void 컴파일러의_컴파일_에러는_SAMPLE을_다_보고_정한다() {
        CaseOutcome cppError = new CaseOutcome.CompileError("main.cpp:3:1: error", true);
        // 다른 SAMPLE이 아직이면 기다린다. 도착 순서에 따라 판정이 갈리지 않게 한다
        assertThat(SubmissionOutcome.combine(List.of(sample(cppError), sample(PENDING), hidden(PENDING))))
                .isEqualTo(new SubmissionOutcome.InProgress(0));
        // SAMPLE이 모두 컴파일 에러면 컴파일 에러다. 비공개 케이스는 기다리지 않는다
        assertThat(SubmissionOutcome.combine(List.of(sample(cppError), sample(cppError), hidden(PENDING))))
                .isEqualTo(new SubmissionOutcome.CompileError("main.cpp:3:1: error"));
        // HIDDEN이라도 판정이 났으면 컴파일된 것이라 채점 불가다
        assertThat(SubmissionOutcome.combine(List.of(sample(cppError), hidden(judged(Verdict.ACCEPTED, 10, 9_000)))))
                .isInstanceOf(SubmissionOutcome.JudgeError.class);
    }

    @Test
    void Python_문법_오류는_다른_SAMPLE을_기다리지_않는다() {
        assertThat(SubmissionOutcome.combine(List.of(
                sample(new CaseOutcome.CompileError("SyntaxError", false)), sample(PENDING), hidden(PENDING))))
                .isEqualTo(new SubmissionOutcome.CompileError("SyntaxError"));
    }

    @Test
    void SAMPLE이_없으면_컴파일_에러를_확정하지_않는다() {
        assertThat(SubmissionOutcome.combine(List.of(hidden(new CaseOutcome.CompileError("error", true)))))
                .isEqualTo(new SubmissionOutcome.JudgeError("SAMPLE 케이스가 없어 컴파일 에러를 확정할 수 없다"));
    }

    @Test
    void HIDDEN만_컴파일_에러면_SAMPLE_결과를_따른다() {
        CaseOutcome hiddenCompile = new CaseOutcome.CompileError("error", true);
        // SAMPLE이 아직이면 기다린다
        assertThat(SubmissionOutcome.combine(List.of(sample(PENDING), hidden(hiddenCompile))))
                .isEqualTo(new SubmissionOutcome.InProgress(0));
        // SAMPLE은 컴파일됐으면 학생 코드 탓이 아니다
        assertThat(SubmissionOutcome.combine(List.of(sample(judged(Verdict.ACCEPTED, 10, 9_000)), hidden(hiddenCompile))))
                .isInstanceOf(SubmissionOutcome.JudgeError.class);
        // SAMPLE끼리 엇갈려도 학생 코드 탓이 아니다
        assertThat(SubmissionOutcome.combine(List.of(
                sample(judged(Verdict.ACCEPTED, 10, 9_000)), sample(new CaseOutcome.CompileError("error", true)), hidden(PENDING))))
                .isInstanceOf(SubmissionOutcome.JudgeError.class);
        // Python 문법 오류는 HIDDEN에서 런타임 에러로 와도 컴파일 에러다
        CaseOutcome pythonSyntax = new CaseOutcome.CompileError("SyntaxError", false);
        CaseOutcome hiddenRuntime = new CaseOutcome.Judged(Verdict.RUNTIME_ERROR, RuntimeErrorType.OTHER, 20, 9_000);
        assertThat(SubmissionOutcome.combine(List.of(sample(pythonSyntax), hidden(hiddenRuntime))))
                .isEqualTo(new SubmissionOutcome.CompileError("SyntaxError"));
        // 학생이 SAMPLE 하나에서만 문법 오류 모양을 찍어도 채점 불가가 아니라 컴파일 에러다
        assertThat(SubmissionOutcome.combine(List.of(sample(judged(Verdict.ACCEPTED, 10, 9_000)), sample(pythonSyntax))))
                .isEqualTo(new SubmissionOutcome.CompileError("SyntaxError"));
        // SAMPLE도 컴파일 에러면 컴파일 에러다
        assertThat(SubmissionOutcome.combine(List.of(sample(new CaseOutcome.CompileError("error", true)), hidden(hiddenCompile))))
                .isEqualTo(new SubmissionOutcome.CompileError("error"));
    }

    @Test
    void 채점_불가인_케이스가_있으면_바로_채점_불가다() {
        assertThat(SubmissionOutcome.combine(List.of(
                sample(judged(Verdict.ACCEPTED, 10, 9_000)), hidden(new CaseOutcome.JudgeError("status 14")), hidden(PENDING))))
                .isEqualTo(new SubmissionOutcome.JudgeError("status 14"));
        assertThat(SubmissionOutcome.combine(List.of(sample(new CaseOutcome.InternalError()))))
                .isInstanceOf(SubmissionOutcome.JudgeError.class);
        assertThat(SubmissionOutcome.combine(List.of())).isInstanceOf(SubmissionOutcome.JudgeError.class);
    }

    private static SubmissionOutcome.Case sample(CaseOutcome outcome) {
        return new SubmissionOutcome.Case(true, outcome);
    }

    private static SubmissionOutcome.Case hidden(CaseOutcome outcome) {
        return new SubmissionOutcome.Case(false, outcome);
    }

    private static CaseOutcome judged(Verdict verdict, int timeMs, int memoryKb) {
        return new CaseOutcome.Judged(verdict, null, timeMs, memoryKb);
    }
}
