CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(320),
    password_hash VARCHAR(255),
    -- 재설정마다 1씩 올린다. 토큰에 담긴 값과 다르면 거절해 재설정 즉시 모든 기기를 로그아웃시킨다.
    -- 시각 비교는 iat가 초 단위라 같은 초 안의 재설정 전후를 구분하지 못한다.
    token_version INTEGER NOT NULL DEFAULT 0,
    nickname VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(16) NOT NULL DEFAULT 'USER'
        CHECK (role IN ('USER', 'ADMIN')),
    CHECK (password_hash IS NULL OR email IS NOT NULL)
);

CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_nickname_lower_idx ON users (lower(nickname));

CREATE TABLE oauth_accounts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(24) NOT NULL CHECK (provider IN ('GITHUB')),
    provider_user_id VARCHAR(255) NOT NULL,
    provider_username VARCHAR(100),
    UNIQUE (provider, provider_user_id),
    UNIQUE (user_id, provider)
);

CREATE TABLE refresh_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    family_id UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by_token_id BIGINT UNIQUE REFERENCES refresh_tokens(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id, expires_at DESC);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

CREATE TABLE email_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(320) NOT NULL,
    purpose VARCHAR(24) NOT NULL CHECK (purpose IN ('VERIFY_EMAIL', 'RESET_PASSWORD')),
    token_hash VARCHAR(128) NOT NULL,
    attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX email_tokens_email_purpose_idx ON email_tokens (lower(email), purpose, created_at DESC);
CREATE UNIQUE INDEX email_tokens_one_active_idx ON email_tokens (lower(email), purpose)
    WHERE used_at IS NULL;

CREATE TABLE problems (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug VARCHAR(120) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE problem_versions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    problem_id BIGINT NOT NULL REFERENCES problems(id),
    version_no INTEGER NOT NULL CHECK (version_no > 0),
    title VARCHAR(200) NOT NULL,
    difficulty VARCHAR(16) NOT NULL CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
    statement_markdown TEXT NOT NULL,
    input_description TEXT NOT NULL,
    output_description TEXT NOT NULL,
    constraints_markdown TEXT NOT NULL DEFAULT '',
    source_name VARCHAR(200),
    source_url TEXT,
    license VARCHAR(120),
    status VARCHAR(16) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'VALIDATING', 'PUBLISHED', 'RETIRED')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (problem_id, version_no),
    UNIQUE (id, problem_id),
    CHECK ((status <> 'PUBLISHED') OR published_at IS NOT NULL)
);

CREATE INDEX problem_versions_published_idx
    ON problem_versions (published_at DESC, problem_id)
    WHERE status = 'PUBLISHED';

CREATE UNIQUE INDEX problem_versions_one_published_idx
    ON problem_versions (problem_id)
    WHERE status = 'PUBLISHED';

CREATE TABLE problem_language_configs (
    problem_version_id BIGINT NOT NULL REFERENCES problem_versions(id) ON DELETE CASCADE,
    language VARCHAR(16) NOT NULL CHECK (language IN ('PYTHON', 'CPP')),
    time_limit_ms INTEGER NOT NULL CHECK (time_limit_ms > 0),
    memory_limit_mb INTEGER NOT NULL CHECK (memory_limit_mb > 0),
    starter_code TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (problem_version_id, language)
);

CREATE TABLE concept_tags (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE problem_version_tags (
    problem_version_id BIGINT NOT NULL REFERENCES problem_versions(id) ON DELETE CASCADE,
    concept_tag_id BIGINT NOT NULL REFERENCES concept_tags(id),
    PRIMARY KEY (problem_version_id, concept_tag_id)
);

CREATE TABLE test_cases (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    problem_version_id BIGINT NOT NULL REFERENCES problem_versions(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK (ordinal > 0),
    case_type VARCHAR(16) NOT NULL CHECK (case_type IN ('SAMPLE', 'HIDDEN')),
    input_data TEXT NOT NULL,
    expected_output TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (problem_version_id, ordinal),
    UNIQUE (id, problem_version_id)
);

CREATE INDEX test_cases_version_type_idx ON test_cases (problem_version_id, case_type, ordinal);

CREATE TABLE reference_solutions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    problem_version_id BIGINT NOT NULL REFERENCES problem_versions(id) ON DELETE CASCADE,
    language VARCHAR(16) NOT NULL CHECK (language IN ('PYTHON', 'CPP')),
    solution_role VARCHAR(16) NOT NULL CHECK (solution_role IN ('REFERENCE', 'BRUTE')),
    source_code TEXT NOT NULL,
    verified_at TIMESTAMPTZ,
    UNIQUE (problem_version_id, language, solution_role),
    UNIQUE (id, problem_version_id)
);

CREATE TABLE submissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_version_id BIGINT NOT NULL REFERENCES problem_versions(id),
    submission_kind VARCHAR(16) NOT NULL DEFAULT 'SUBMIT'
        CHECK (submission_kind IN ('SAMPLE_RUN', 'SUBMIT', 'VALIDATION')),
    -- 같은 버전·언어에 REFERENCE와 BRUTE가 함께 있어 언어만으로는 어느 코드를 검증했는지 알 수 없다.
    reference_solution_id BIGINT,
    language VARCHAR(16) NOT NULL CHECK (language IN ('PYTHON', 'CPP')),
    source_code TEXT NOT NULL,
    job_status VARCHAR(16) NOT NULL DEFAULT 'QUEUED'
        CHECK (job_status IN ('QUEUED', 'COMPILING', 'RUNNING', 'COMPLETED', 'JUDGE_ERROR')),
    progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    verdict VARCHAR(24) CHECK (verdict IN (
        'ACCEPTED', 'PRESENTATION_ERROR', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED',
        'MEMORY_LIMIT_EXCEEDED', 'OUTPUT_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILE_ERROR'
    )),
    runtime_error_type VARCHAR(80),
    compiler_message TEXT,
    execution_time_ms INTEGER CHECK (execution_time_ms IS NULL OR execution_time_ms >= 0),
    memory_used_kb INTEGER CHECK (memory_used_kb IS NULL OR memory_used_kb >= 0),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    judged_at TIMESTAMPTZ,
    UNIQUE (id, problem_version_id),
    CHECK ((job_status <> 'COMPLETED') OR verdict IS NOT NULL),
    CHECK ((submission_kind = 'VALIDATION') = (reference_solution_id IS NOT NULL)),
    -- 다른 버전의 정답 코드를 가리키면 그 코드가 이 버전 케이스로 검증된 것으로 기록된다.
    FOREIGN KEY (reference_solution_id, problem_version_id)
        REFERENCES reference_solutions(id, problem_version_id) ON DELETE CASCADE
);

CREATE INDEX submissions_user_history_idx ON submissions (user_id, submitted_at DESC, id DESC)
    WHERE submission_kind = 'SUBMIT';
CREATE INDEX submissions_problem_user_idx ON submissions (problem_version_id, user_id, job_status);
CREATE INDEX submissions_reference_solution_idx ON submissions (reference_solution_id)
    WHERE reference_solution_id IS NOT NULL;

CREATE TABLE submission_test_results (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    submission_id BIGINT NOT NULL,
    problem_version_id BIGINT NOT NULL,
    test_case_id BIGINT NOT NULL,
    judge_token VARCHAR(120) UNIQUE,
    verdict VARCHAR(24) CHECK (verdict IN (
        'ACCEPTED', 'PRESENTATION_ERROR', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED',
        'MEMORY_LIMIT_EXCEEDED', 'OUTPUT_LIMIT_EXCEEDED', 'RUNTIME_ERROR'
    )),
    execution_time_ms INTEGER CHECK (execution_time_ms IS NULL OR execution_time_ms >= 0),
    memory_used_kb INTEGER CHECK (memory_used_kb IS NULL OR memory_used_kb >= 0),
    stdout VARCHAR(65536),
    stderr VARCHAR(65536),
    UNIQUE (submission_id, test_case_id),
    FOREIGN KEY (submission_id, problem_version_id)
        REFERENCES submissions(id, problem_version_id) ON DELETE CASCADE,
    FOREIGN KEY (test_case_id, problem_version_id)
        REFERENCES test_cases(id, problem_version_id) ON DELETE RESTRICT
);

CREATE TABLE ai_reviews (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    submission_id BIGINT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    review_type VARCHAR(16) NOT NULL CHECK (review_type IN ('ANALYSIS', 'CODE_REVIEW')),
    prompt_version VARCHAR(80) NOT NULL,
    model VARCHAR(120) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    content JSONB,
    input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
    output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
    cost_usd NUMERIC(12, 6) CHECK (cost_usd IS NULL OR cost_usd >= 0),
    revealed_hint_level SMALLINT NOT NULL DEFAULT 0 CHECK (revealed_hint_level BETWEEN 0 AND 3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE (submission_id, review_type, prompt_version),
    CHECK ((status <> 'COMPLETED') OR content IS NOT NULL)
);

CREATE INDEX ai_reviews_created_idx ON ai_reviews (created_at);

CREATE TABLE review_feedback (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ai_review_id BIGINT NOT NULL UNIQUE REFERENCES ai_reviews(id) ON DELETE CASCADE,
    helpful BOOLEAN NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_problem_stats (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id BIGINT NOT NULL REFERENCES problems(id),
    solved BOOLEAN NOT NULL DEFAULT FALSE,
    first_solved_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_revealed_hint_level SMALLINT NOT NULL DEFAULT 0 CHECK (max_revealed_hint_level BETWEEN 0 AND 3),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, problem_id),
    CHECK (solved = (first_solved_at IS NOT NULL))
);

CREATE INDEX user_problem_stats_problem_idx ON user_problem_stats (problem_id, user_id);

CREATE TABLE learning_reports (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    statistics JSONB NOT NULL,
    content JSONB,
    model VARCHAR(120),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, report_date),
    CHECK ((status <> 'COMPLETED') OR content IS NOT NULL)
);

CREATE INDEX learning_reports_user_generated_idx ON learning_reports (user_id, generated_at DESC);

CREATE TABLE learning_report_recommendations (
    learning_report_id BIGINT NOT NULL REFERENCES learning_reports(id) ON DELETE CASCADE,
    rank SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 3),
    problem_id BIGINT NOT NULL,
    problem_version_id BIGINT NOT NULL,
    concept_tag_id BIGINT REFERENCES concept_tags(id),
    reason TEXT NOT NULL,
    PRIMARY KEY (learning_report_id, rank),
    UNIQUE (learning_report_id, problem_id),
    FOREIGN KEY (problem_version_id, problem_id) REFERENCES problem_versions(id, problem_id),
    FOREIGN KEY (problem_version_id, concept_tag_id)
        REFERENCES problem_version_tags(problem_version_id, concept_tag_id)
);
