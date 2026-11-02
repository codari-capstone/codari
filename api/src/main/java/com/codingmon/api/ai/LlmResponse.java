package com.codingmon.api.ai;

// json은 ai_reviews.content에 그대로 저장할 모델 응답 원문이다. usage에는 재요청까지 합친 토큰 수가 들어 있다.
record LlmResponse<T>(T value, String json, LlmUsage usage) {
}
