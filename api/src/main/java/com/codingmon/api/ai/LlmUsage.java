package com.codingmon.api.ai;

record LlmUsage(int inputTokens, int outputTokens) {

    static final LlmUsage NONE = new LlmUsage(0, 0);

    LlmUsage plus(LlmUsage other) {
        return new LlmUsage(inputTokens + other.inputTokens, outputTokens + other.outputTokens);
    }
}
