package com.codingmon.api.ai;

import java.util.Map;

// schema는 모델의 출력을 제한하는 JSON 스키마이고, responseType은 받은 JSON을 읽어 Bean Validation으로 검증할 타입이다.
record LlmRequest<T>(String system, String user, String schemaName, Map<String, Object> schema,
        Class<T> responseType) {
}
