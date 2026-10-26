-- 케이스마다 런타임 에러 종류를 남긴다. 비공개 케이스는 stderr를 저장하지 않아 나중에 다시 구할 수 없고,
-- 재시작 복구는 판정이 빈 행만 다시 조회하기 때문이다(judge-verdict-mapping.md 제출 판정 합치기 4번).
ALTER TABLE submission_test_results ADD COLUMN runtime_error_type VARCHAR(80);

-- Judge0 내부 오류(status 13)로 이 케이스를 이미 한 번 다시 보냈는지. API가 재시작해도 한 번만 다시 보낸다
-- (judge-verdict-mapping.md 3절 3번).
ALTER TABLE submission_test_results ADD COLUMN internal_error_retried BOOLEAN NOT NULL DEFAULT FALSE;

-- 채점 처리기가 기다리는 제출을 오래된 순서로 고르고, 재시작할 때 진행 중인 제출을 찾는다.
CREATE INDEX submissions_active_idx ON submissions (submitted_at, id)
    WHERE job_status IN ('QUEUED', 'COMPILING', 'RUNNING');
