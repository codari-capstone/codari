package com.codingmon.api.judge;

import java.math.BigDecimal;

// Judge0 결과 조회 응답 한 건. 출력은 base64를 푼 원본 바이트다(judge-verdict-mapping.md 1절).
// 출력 비교는 이 바이트로 하고, 저장용 변환(StoredText)은 비교가 끝난 뒤에 한다.
// Judge0는 출력이 없으면 빈 문자열 대신 null을 주고, 컴파일 에러면 time·memory·exit_code도 null이다(2절 7번).
record Judge0Result(int statusId, byte[] stdout, byte[] stderr, byte[] compileOutput, BigDecimal time, Integer memoryKb,
        Integer exitCode, Integer exitSignal) {
}
