package com.codingmon.api.submission;

// 제출이 QUEUED로 저장돼 커밋됐다. 채점 처리기(#71)가 @TransactionalEventListener(phase = AFTER_COMMIT)로 받는다.
public record SubmissionQueued(long submissionId) {
}
