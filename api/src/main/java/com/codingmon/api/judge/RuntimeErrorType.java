package com.codingmon.api.judge;

// 런타임 에러 종류(judge-verdict-mapping.md 4절). runtime_error_type 컬럼과 openapi runtimeErrorType이 이 이름을 쓴다.
// 화면 문구는 웹이 가진다(AI_FEATURES 10절 런타임 에러 종류별 설명).
public enum RuntimeErrorType {
    INDEX_ERROR, ZERO_DIVISION, VALUE_ERROR, NAME_ERROR, TYPE_ERROR, RECURSION_ERROR, EOF_ERROR, OTHER
}
