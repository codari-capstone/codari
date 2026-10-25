package com.codingmon.api.judge;

// 테스트케이스 하나의 Judge0 결과를 판정 규칙(judge-verdict-mapping.md 3절)으로 옮긴 것.
sealed interface CaseOutcome {

    // status 1·2. 계속 폴링한다.
    record Pending() implements CaseOutcome {
    }

    // status 13. 채점 처리기가 같은 케이스를 한 번 다시 제출하고, 또 나오면 채점 불가로 끝낸다(3번).
    // message는 Judge0가 준 원인 문구(없으면 null)이고 운영 로그에만 쓴다.
    record InternalError(String message) implements CaseOutcome {
    }

    // 채점 불가. reason은 운영 로그용이고 학생에게 보여 주지 않는다.
    record JudgeError(String reason) implements CaseOutcome {
    }

    // message는 저장용으로 변환한 컴파일러 메시지다. HIDDEN 케이스에서 나오면 SubmissionOutcome이 SAMPLE 결과에 맞춰 처리한다(5번).
    record CompileError(String message) implements CaseOutcome {
    }

    // errorType은 RUNTIME_ERROR일 때만 있다. timeMs·memoryKb는 Judge0가 값을 주지 않았으면 null이다.
    record Judged(Verdict verdict, RuntimeErrorType errorType, Integer timeMs, Integer memoryKb) implements CaseOutcome {
    }
}
