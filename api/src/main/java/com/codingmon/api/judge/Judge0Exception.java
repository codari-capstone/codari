package com.codingmon.api.judge;

// 채점 서버 호출이 실패해 이 제출을 채점할 수 없다. 채점 처리기는 제출을 JUDGE_ERROR로 끝낸다.
class Judge0Exception extends RuntimeException {

    Judge0Exception(String message) {
        super(message);
    }

    Judge0Exception(String message, Throwable cause) {
        super(message, cause);
    }
}
