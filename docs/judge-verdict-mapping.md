# Judge0 결과 → 판정 매핑

Judge0 1.13.1의 응답을 우리 판정 9가지와 런타임 에러 이름으로 바꾸는 규칙이다. #29(채점 실행·판정)와 #28(예제 실행)은 이 문서를 구현 기준으로 삼는다.

- 화면 문구·출력 비교·공개 범위의 기준은 [`AI_FEATURES.md` 10절](AI_FEATURES.md#10-채점-결과와-쉬운-설명-ai-없이-표시)이다. 이 문서는 Judge0 응답을 그 판정으로 옮기는 방법만 정한다.
- 저장 형식은 `V1__initial_schema.sql`의 `submissions`를 따른다. 판정은 `verdict` 8종이고, '채점 불가'는 `job_status = 'JUDGE_ERROR'`에 `verdict = NULL`이다. 런타임 에러 종류는 `runtime_error_type`에 넣는다.
- 규칙의 근거는 격리·자원 제한 검증(#66) 케이스를 맥 Docker Desktop(cgroup v1, Rosetta)에서 돌려 관찰한 결과다. 케이스와 관찰 JSON은 채점 VM 재확인을 마친 뒤 #66에서 `judge/verify/`로 올린다. 채점 VM에서 다시 확인할 항목은 [9절](#9-채점-vm에서-다시-확인할-것)에 있다.

## 1. 요청 규약

| 항목 | 값 |
|---|---|
| 언어 | Python `71` (Python 3.8.1), C++ `54` (GCC 9.2.0) |
| C++ 컴파일 옵션 | `-O2 -std=c++17` 고정. API 서버만 보낸다. Python에는 보내지 않는다(보내면 422) |
| 인코딩 | 항상 `base64_encoded=true`로 보내고 받는다. 비UTF-8 출력도 조회가 깨지지 않는다 |
| 기대 출력 | `expected_output`을 보내지 않는다. 출력 비교는 API 서버가 한다 |
| 제한값 | `problem_language_configs`의 언어별 값을 단위만 바꿔 보낸다: `cpu_time_limit` = `time_limit_ms` / 1000(초), `memory_limit` = `memory_limit_mb` × 1024(KB). Python 보정은 문제 등록 때 이미 적용돼 있으므로 다시 곱하지 않는다 |
| 보내지 않는 것 | `enable_network`, `additional_files`, `command_line_arguments`, `callback_url`, `number_of_runs`, 프로세스별 제한 옵션. 브라우저에서 받은 값은 어떤 것도 Judge0 요청에 넣지 않는다 |
| 결과 조회 | 토큰으로 폴링한다(채점 서버는 `wait=true`를 400으로 거절). `fields=status,stdout,stderr,compile_output,message,time,wall_time,memory,exit_code,exit_signal`을 명시한다 — 기본 응답에는 `exit_code`가 없다 |
| 묶음 제출 | 테스트케이스는 `POST /submissions/batch`로 최대 20개씩 보낸다 |
| 삭제 | 결과를 읽은 뒤 `DELETE /submissions/{token}`(`X-Auth-User` 필요)으로 지울 수 있다. 사용 여부는 #29에서 정한다 |

## 2. 먼저 알아 둘 Judge0 동작

검증에서 확인한, Judge0 문서만 보고는 알 수 없는 동작이다.

1. **신호는 status가 아니라 `exit_code`로 온다.** Judge0는 프로그램을 `/bin/bash run` 스크립트로 감싸 실행한다. 프로그램이 신호로 끝나면 isolate에는 bash의 비정상 종료로 보이므로 status는 `11 Runtime Error (NZEC)`, `exit_code`는 `128 + 신호 번호`, `exit_signal`은 비어 있다. 문서의 status 7~10(SIGSEGV·SIGXFSZ·SIGFPE·SIGABRT)은 이 구성에서 나오지 않았다. 구현은 status 7~10도 처리하되 `exit_code`를 기준으로 판단한다.
2. **Judge0에는 메모리 초과 status가 없다.** 메모리 제한(cgroup)에 걸리면 커널이 SIGKILL로 끝내고, 응답은 status 11, `exit_code` 137, `memory` = 요청한 `memory_limit`(KB)이다.
3. **출력은 제한 크기에서 잘린다.** stdout·stderr는 각각 `max_file_size`(기본 1024 KB)에서 정확히 잘린다. C++은 SIGXFSZ(`exit_code` 153)로 끝나지만, Python은 SIGXFSZ를 무시하므로 `OSError: [Errno 27] File too large`(`exit_code` 1)나, stderr가 넘치면 `exit_code` 120으로 끝난다.
4. **status 3은 "정답"이 아니라 "정상 종료"다.** 기대 출력을 보내지 않으므로 Judge0는 비교하지 않는다.
5. **stderr 끝에 bash 메시지가 붙는다.** 신호로 끝나면 `run: line 1:     3 Killed                  /usr/local/python-3.8.1/bin/python3 script.py` 같은 줄이 붙는다. 학생에게 보여 주기 전에 지운다(7절).
6. **Python 문법 오류는 실행 단계에서 난다.** Python은 컴파일 단계가 없어 `SyntaxError`도 status 11로 온다. 이때 stderr에는 `Traceback (most recent call last):` 머리줄이 없다.

## 3. 테스트케이스 하나의 판정 순서

위에서부터 처음 맞는 규칙을 적용한다. `limit_bytes` = 요청한 `max_file_size` × 1024.

| 순서 | 조건 | 결과 |
|---|---|---|
| 1 | HTTP 오류·폴링 기한 초과 | 6절 규칙 |
| 2 | status 1·2 | 진행 중. 계속 폴링 |
| 3 | status 13 (Internal Error) | 같은 케이스를 1회 다시 제출한다. 또 13이면 채점 불가 |
| 4 | status 14 (Exec Format Error) | 채점 불가 |
| 5 | status 6 (Compilation Error) | `COMPILE_ERROR`. `compile_output` → `compiler_message` |
| 6 | Python, status 11, stderr에 `Traceback (most recent call last):`가 없고 마지막 줄이 `SyntaxError`·`IndentationError`·`TabError`로 시작 | `COMPILE_ERROR`. stderr(7절대로 정리) → `compiler_message` |
| 7 | status 5 | `TIME_LIMIT_EXCEEDED` |
| 8 | `len(stdout 바이트) ≥ limit_bytes` 또는 `len(stderr 바이트) ≥ limit_bytes`, 또는 status 8, 또는 `exit_code` 153 | `OUTPUT_LIMIT_EXCEEDED` |
| 9 | (`exit_code` 137 또는 `exit_signal` 9) 이고 `memory ≥ memory_limit` | `MEMORY_LIMIT_EXCEEDED` |
| 10 | Python 예외 이름(5절)이 `MemoryError`, 또는 C++ stderr에 `std::bad_alloc` | `MEMORY_LIMIT_EXCEEDED` |
| 11 | status 7·9·10·11·12 (위에 해당하지 않음) | `RUNTIME_ERROR`. 종류는 4절 |
| 12 | status 3 | API 서버가 출력을 비교해 `ACCEPTED`·`PRESENTATION_ERROR`·`WRONG_ANSWER` (AI_FEATURES 10절 규칙) |
| 13 | status 4 | 12와 같이 판정하고 경고를 남긴다. `expected_output`을 보냈다는 뜻이라 연동 버그다 |
| 14 | 그 밖의 status | 채점 불가, 오류 로그 |

- 6번은 백준과 같은 처리다(AI_FEATURES 10절은 판정 종류를 백준에 맞춘다). 백준은 Python 코드를 실행 전에 `py_compile`로 검사해 문법 오류를 컴파일 에러로 낸다. `exec()` 안에서 난 SyntaxError는 머리줄이 있어 런타임 에러로 분류된다.
- 9번은 `memory` 값과 함께 본다. `exit_code` 137인데 `memory`가 제한보다 작으면 메모리 초과가 아니므로 런타임 에러(기타)로 두고 로그를 남긴다.
- 끝없는 재귀는 스택이 메모리에 포함되어(`stack_limit` = `memory_limit`) 9번의 메모리 초과로 판정된다. C++에서 스택 넘침과 메모리 초과는 응답만으로 구분할 수 없다.
- 10번의 stderr 문자열은 학생 코드가 직접 출력할 수도 있다. 그렇게 해서 얻는 것은 '런타임 에러'가 '메모리 초과'로 바뀌는 것뿐이라 그대로 둔다.

## 4. 런타임 에러 종류

`runtime_error_type`에 넣는 값과 화면 표시다. 화면 문구와 설명은 AI_FEATURES 10절 "런타임 에러 종류별 설명" 표를 쓴다. 저장 코드는 제안이며 #29에서 API 계약과 함께 확정한다.

| 저장 코드(제안) | 화면 표시 | Python 예외(5절) | C++ (`exit_code`, stderr) |
|---|---|---|---|
| `INDEX_ERROR` | IndexError / Segfault | `IndexError` | 139 (SIGSEGV), 또는 134이고 stderr에 `std::out_of_range` |
| `ZERO_DIVISION` | ZeroDivisionError / DivisionByZero | `ZeroDivisionError` | 136 (SIGFPE) |
| `VALUE_ERROR` | ValueError | `ValueError` | 134이고 stderr에 `std::invalid_argument` (`stoi` 등) |
| `NAME_ERROR` | NameError | `NameError`, `UnboundLocalError` | — (컴파일 에러로 잡힌다) |
| `TYPE_ERROR` | TypeError | `TypeError` | — |
| `RECURSION_ERROR` | RecursionError / StackOverflow | `RecursionError` | — (3절: 메모리 초과로 판정) |
| `EOF_ERROR` | EOFError | `EOFError` | — |
| `OTHER` | 런타임 에러 (기타) | 위 7개가 아닌 예외(`KeyError`, `AttributeError`, `AssertionError`, 사용자 정의 예외 등), 트레이스백 없는 비정상 종료(`sys.exit(1)`) | 134의 그 밖의 경우(`assert`, `throw 42`), 0이 아닌 일반 종료 코드(1~127), 그 밖의 신호 |

## 5. Python 예외 이름 읽기

1. stderr에서 7절의 bash 메시지 줄을 지운다.
2. 마지막 `Traceback (most recent call last):` 줄 이후만 본다. 그 앞의 디버그 출력은 무시한다(학생이 `ValueError` 같은 단어를 stderr에 찍어도 영향이 없다).
3. 그 구간의 마지막 비어 있지 않은 줄에서 `^([A-Za-z_][\w.]*)(:|$)`로 이름을 뽑고, 모듈 접두어(`__main__.`)를 떼어 마지막 부분만 쓴다.
4. 트레이스백이 없으면 이름이 없는 것으로 보고 `OTHER`다(단, 3절 6번의 문법 오류 확인이 먼저다).

| stderr 마지막 부분 (관찰) | 이름 | 결과 |
|---|---|---|
| `IndexError: list index out of range` | IndexError | 런타임 에러 `INDEX_ERROR` |
| `debug ValueError: …` 뒤에 트레이스백, 마지막 줄 `IndexError: …` | IndexError | 런타임 에러 `INDEX_ERROR` |
| `__main__.MyError: boom` | MyError | 런타임 에러 `OTHER` |
| `UnboundLocalError: local variable 'x' referenced before assignment` | UnboundLocalError | 런타임 에러 `NAME_ERROR` |
| 머리줄 없이 `SyntaxError: unexpected EOF while parsing` | — | 컴파일 에러 |
| (비어 있음, `exit_code` 1) | — | 런타임 에러 `OTHER` |

## 6. 채점 서버 오류와 재시도

| 상황 | 처리 |
|---|---|
| 401·403 | 설정 오류(토큰). 재시도하지 않고 `JUDGE_ERROR`, 운영 알림 |
| 422 | 요청 값 오류(우리 버그). 재시도하지 않고 `JUDGE_ERROR`, 오류 로그 |
| 503 (`queue is full`) | 지수 백오프로 재시도. 한도를 넘기면 `JUDGE_ERROR` |
| 연결 오류·타임아웃·5xx (결과 조회) | 같은 GET을 백오프로 재시도 |
| 연결 오류·타임아웃·5xx (제출 POST) | 응답(토큰)을 받지 못하면 같은 요청을 자동으로 다시 보내지 않고 `JUDGE_ERROR`로 끝낸다. 제출이 이미 들어갔을 수 있어, 다시 보내면 같은 코드가 두 번 실행된다 |
| 폴링 기한 초과 | `cpu_time_limit`가 아니라 큐 대기까지 고려한 기한이다. 넘기면 `JUDGE_ERROR` |
| status 13·14, 14번 행 | 3절 |

`JUDGE_ERROR`인 제출은 시도 횟수에 넣지 않는다(`database-tables.md` `user_problem_stats`).

## 7. 학생에게 보여 줄 메시지 정리

- stderr에서 `^run: line \d+:` 로 시작하는 줄을 지운다. Judge0 내부 경로(`/usr/local/python-3.8.1/bin/python3`, `LD_LIBRARY_PATH=…`)가 들어 있다.
- 예외 원문과 줄 번호는 공개 예제(SAMPLE)에서만 보여 준다. 비공개 테스트에서는 종류(4절)만 보여 준다(AI_FEATURES 10절).
- 컴파일 에러 메시지(`compile_output`, Python 문법 오류의 stderr)는 결과 화면에서 보여 준다(AI_FEATURES 10절 컴파일 에러 행).

## 8. 관찰 근거

아래 케이스 이름은 #66 검증 케이스다. #66에서 결과 표(`judge/verify/results/`)와 케이스별 관찰 JSON(`judge/verify/observed/<환경>/<케이스>.json`)을 함께 올린다. #29의 단위 테스트는 이 JSON의 `result`를 입력으로 쓸 수 있다.

| 규칙 | 근거 케이스 | 관찰 |
|---|---|---|
| 신호 → status 11 + `exit_code` 128+N | `cpp_nullptr_cpp`, `cpp_divzero_cpp`, `cpp_assert_cpp`, `ole_stdout_cpp` | 139, 136, 134, 153. `exit_signal` 없음 |
| 메모리 초과 | `mle_list_py`, `mle_touch_py`, `mle_vector_cpp`, `mle_grow_cpp` | status 11, `exit_code` 137, `memory` 262144 = 제한 |
| 끝없는 재귀 | `rec_deep_py`, `rec_deep_cpp` | 메모리 초과와 같은 응답 |
| 출력 초과 | `ole_stdout_py`, `ole_stderr_py`, `ole_stdout_cpp` | 출력이 1,048,576바이트(= 1024 KB)에서 잘림. `exit_code` 1·120·153 |
| 시간 초과 | `tle_loop_py`, `tle_loop_cpp`, `tle_sleep_py` | status 5. CPU 2.1초 / wall 5.0초 |
| Python 예외 이름 | `exc_*_py` 14개 | 트레이스백 마지막 줄 |
| Python 문법 오류 | `exc_syntax_py`, `exc_indent_py` | status 11, 트레이스백 머리줄 없음 |
| C++ 예외 종류 | `cpp_at_cpp`, `cpp_stoi_cpp`, `cpp_throw_cpp` | 134, stderr `std::out_of_range`·`std::invalid_argument`·`'int'` |
| 컴파일 에러 | `cpp_compile_error_cpp` | status 6 |

## 9. 채점 VM에서 다시 확인할 것

맥 결과는 amd64 명령을 Rosetta로 번역해 실행한 것이다. #66에서 채점 VM에 같은 케이스를 돌려 아래가 같은지 확인하고, 다르면 이 문서를 고친다.

- 신호가 status 11 + `exit_code` 128+N으로 오는지(2절 1번)
- 메모리 초과 응답의 `memory`가 제한값과 같은지(3절 9번)
- `::operator new(4 TB)`가 `std::bad_alloc`으로 끝나는지(맥은 `vm.overcommit_memory=1`이라 할당이 성공했다)
