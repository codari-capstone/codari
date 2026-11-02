package com.codingmon.api.ai;

// LLM 호출의 경계. AI 기능은 이 인터페이스만 보므로 모델을 띄우는 엔진이 바뀌어도 그대로다.
interface LlmClient {

    // ai_reviews의 PENDING 행을 호출 전에 만들어야 해서 모델 이름과 프롬프트 버전을 미리 알려 준다.
    String model();

    String promptVersion();

    // 응답이 스키마를 어기면 한 번 다시 요청한다. 그래도 안 되거나 호출이 실패하면 LlmException을 던진다.
    <T> LlmResponse<T> complete(LlmRequest<T> request);
}
