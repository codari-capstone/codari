package com.codingmon.api.judge;

// 판정. submissions.verdict CHECK 제약·openapi verdict와 이름이 같다.
// '채점 불가'는 판정이 아니라 job_status = 'JUDGE_ERROR'(verdict = NULL)로 나타낸다.
// submission_test_results.verdict에는 COMPILE_ERROR가 없다(judge-verdict-mapping.md 제출 판정 합치기 1번).
public enum Verdict {
    ACCEPTED, PRESENTATION_ERROR, WRONG_ANSWER, TIME_LIMIT_EXCEEDED, MEMORY_LIMIT_EXCEEDED, OUTPUT_LIMIT_EXCEEDED,
    RUNTIME_ERROR, COMPILE_ERROR
}
