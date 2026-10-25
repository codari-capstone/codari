# Judge0 결과 → 판정 매핑

Judge0 1.13.1의 응답을 우리 판정 9가지와 런타임 에러 이름으로 바꾸는 규칙이다. #29(채점 실행·판정)와 #28(예제 실행)은 이 문서를 구현 기준으로 삼는다.

- 화면 문구·출력 비교·공개 범위의 기준은 [`AI_FEATURES.md` 10절](AI_FEATURES.md#10-채점-결과와-쉬운-설명-ai-없이-표시)이다. 이 문서는 Judge0 응답을 그 판정으로 옮기는 방법만 정한다.
- 저장 형식은 `V1__initial_schema.sql`의 `submissions`·`submission_test_results`를 따른다. 판정은 `verdict` 8종이고, '채점 불가'는 `job_status = 'JUDGE_ERROR'`에 `verdict = NULL`이다. 런타임 에러 종류는 `runtime_error_type`에 넣는다. 케이스 행의 `verdict`에는 `COMPILE_ERROR`가 없다([제출 판정 합치기](#제출-판정-합치기)).
- 채점 서버의 기본값·상한은 [`judge/judge0.conf`](../judge/judge0.conf)와 [`judge/README.md`](../judge/README.md)를 따른다. 상한은 #65 실측 뒤 바뀔 수 있어 이 문서는 숫자 대신 설정 이름(`MAX_CPU_TIME_LIMIT` 등)으로 적는다.
- 규칙의 근거는 격리·자원 제한 검증(#66) 케이스를 맥 Docker Desktop(cgroup v1, Rosetta)에서 돌려 관찰한 결과다. 케이스와 관찰 JSON은 채점 VM 재확인을 마친 뒤 #66에서 `judge/verify/`로 올린다. 채점 VM에서 다시 확인할 항목은 [9절](#9-채점-vm에서-다시-확인할-것)에 있다.

## 1. 요청 규약

| 항목 | 값 |
|---|---|
| 언어 | Python `71` (Python 3.8.1), C++ `54` (GCC 9.2.0) |
| C++ 컴파일 옵션 | `-O2 -std=c++17` 고정. API 서버만 보낸다. Python에는 보내지 않는다(보내면 422) |
| 인코딩 | 항상 `base64_encoded=true`로 보내고 받는다. 비UTF-8 출력도 조회가 깨지지 않는다 |
| 기대 출력 | `expected_output`을 보내지 않는다. 출력 비교는 API 서버가 base64를 푼 원본 바이트로 한다(3절 12번) |
| 제한값 | 아래 표의 다섯 값을 요청마다 보낸다. 서버 기본값에 기대지 않는다 |
| 보내지 않는 것 | `enable_network`, `additional_files`, `command_line_arguments`, `callback_url`, `number_of_runs`, `enable_per_process_and_thread_time_limit`, `enable_per_process_and_thread_memory_limit`. 브라우저에서 받은 값은 어떤 것도 Judge0 요청에 넣지 않는다 |
| 결과 조회 | 토큰으로 폴링한다(채점 서버는 `wait=true`를 400으로 거절). `fields=status,stdout,stderr,compile_output,message,time,wall_time,memory,exit_code,exit_signal`을 명시한다 — 기본 응답에는 `exit_code`가 없다. 응답 필드는 `null`일 수 있다(2절 7번) |
| 묶음 제출 | 테스트케이스는 `POST /submissions/batch`로 최대 20개씩 보낸다. 응답은 항목별 목록이고 항목마다 `token`이나 오류가 온다(6절) |
| 삭제 | 결과를 읽은 뒤 `DELETE /submissions/{token}`(`X-Auth-User` 필요)으로 지울 수 있다. 사용 여부는 #29에서 정한다 |

제한값은 `problem_language_configs`의 언어별 값으로 만든다. Python 보정(계획서 초기값: 시간 ×3 + 2초, 메모리 ×2. #65 실측으로 확정)은 문제를 등록할 때 Python 행의 `time_limit_ms`·`memory_limit_mb`에 반영해 저장하므로, 요청을 만들 때 다시 곱하지 않는다.

| 필드 | 값 | 이유 |
|---|---|---|
| `cpu_time_limit` | `time_limit_ms` / 1000 (초) | |
| `wall_time_limit` | min(`cpu_time_limit` × 2 + 1, `MAX_WALL_TIME_LIMIT`) (초) | 보내지 않으면 `WALL_TIME_LIMIT`(5초)가 적용돼, 제한이 5초를 넘는 문제는 정답도 wall 5초에서 끊긴다. ×2 + 1은 서버 기본값(CPU 2초 → wall 5초)과 같은 비율이고, #65 실측으로 조정할 수 있다 |
| `memory_limit` | `memory_limit_mb` × 1024 (KB) | |
| `stack_limit` | `memory_limit`과 같은 값 | 끝없는 재귀를 메모리 초과로 판정하는 근거다(3절). 보내지 않으면 `STACK_LIMIT`(256 MB)이 적용돼, 메모리 제한이 그보다 큰 문제에서는 재귀가 SIGSEGV로 끝난다 |
| `max_file_size` | 1024 (KB) | 출력 제한이자 3절 `limit_bytes`의 기준이다. 서버 기본값과 같아도 명시한다 |

문제를 등록할 때 API는 제한값이 Judge0가 받는 범위인지 검사하고, 벗어나면 등록을 거절한다. 범위는 `time_limit_ms` / 1000 ≤ `MAX_CPU_TIME_LIMIT`, 그리고 2 ≤ `memory_limit_mb`, `memory_limit_mb` × 1024 ≤ `MAX_MEMORY_LIMIT`이다(Judge0 1.13.1은 `memory_limit`이 2048 KB보다 작으면 거절한다). 범위 밖의 값을 보내면 Judge0가 422로 거절해(6절) 그 문제의 모든 제출이 채점 불가가 된다. `stack_limit`은 `MAX_STACK_LIMIT`이 `MAX_MEMORY_LIMIT`과 같아서(`judge/README.md`), `wall_time_limit`은 식이 항상 1초 이상·상한 이하라서 따로 검사하지 않는다. 등록 검사는 다시 돌지 않으므로, `judge0.conf`의 `MAX_*`를 내릴 때는 먼저 게시된 문제의 `problem_language_configs`가 새 상한 안에 드는지 확인한다.

## 2. 먼저 알아 둘 Judge0 동작

검증에서 확인한, Judge0 문서만 보고는 알 수 없는 동작이다.

1. **신호는 status가 아니라 `exit_code`로 온다.** Judge0는 프로그램을 `/bin/bash run` 스크립트로 감싸 실행한다. 프로그램이 신호로 끝나면 isolate에는 bash의 비정상 종료로 보이므로 status는 `11 Runtime Error (NZEC)`, `exit_code`는 `128 + 신호 번호`, `exit_signal`은 비어 있다. 문서의 status 7~10(SIGSEGV·SIGXFSZ·SIGFPE·SIGABRT)은 이 구성에서 나오지 않았다. 구현은 응답 모양과 상관없이 아래 **신호 번호**로 판단한다(이하 '신호').
   - `exit_signal`이 있으면 그 값
   - 없고 `exit_code`가 128보다 크면 `exit_code` − 128
   - 둘 다 없으면 status 7·8·9·10을 각각 11(SIGSEGV)·25(SIGXFSZ)·8(SIGFPE)·6(SIGABRT)으로 본다
   - 그 밖에는 신호 없음
2. **Judge0에는 메모리 초과 status가 없다.** 메모리 제한(cgroup)에 걸리면 커널이 SIGKILL로 끝내고, 응답은 status 11, `exit_code` 137(신호 9), `memory` = 요청한 `memory_limit`(KB)이다.
3. **출력은 제한 크기에서 잘린다.** stdout·stderr는 각각 요청한 `max_file_size`(1절, 1024 KB)에서 정확히 잘린다. C++은 SIGXFSZ(신호 25, `exit_code` 153)로 끝나지만, Python은 SIGXFSZ를 무시하므로 `OSError: [Errno 27] File too large`(`exit_code` 1)나, stderr가 넘치면 `exit_code` 120으로 끝난다.
4. **status 3은 "정답"이 아니라 "정상 종료"다.** 기대 출력을 보내지 않으므로 Judge0는 비교하지 않는다.
5. **stderr 끝에 bash 메시지가 붙는다.** 신호로 끝나면 `run: line 1:     3 Killed                  /usr/local/python-3.8.1/bin/python3 script.py` 같은 줄이 붙는다. 학생에게 보여 주기 전에 지운다(7절).
6. **Python 문법 오류는 실행 단계에서 난다.** Python은 컴파일 단계가 없어 `SyntaxError`도 status 11로 온다. 이때 stderr에는 `Traceback (most recent call last):` 머리줄이 없다. 학생 코드가 stderr에 같은 모양을 직접 찍어도 응답은 똑같다(3절 6번).
7. **응답 필드는 `null`일 수 있다.** 출력이 없으면 stdout·stderr가 빈 문자열이 아니라 `null`로 오고(`sys.exit(1)`), 컴파일 에러(status 6)면 `time`·`memory`·`exit_code`도 `null`이다. 문자열 필드의 `null`은 빈 값으로 본다. `null`인 숫자 필드를 쓰는 조건은 맞지 않는 것으로 본다.

## 3. 테스트케이스 하나의 판정 순서

위에서부터 처음 맞는 규칙을 적용한다. `limit_bytes` = 요청한 `max_file_size` × 1024 = 1,048,576. '신호'는 2절 1번의 신호 번호다.

| 순서 | 조건 | 결과 |
|---|---|---|
| 1 | HTTP 오류·폴링 기한 초과 | 6절 규칙 |
| 2 | status 1·2 | 진행 중. 계속 폴링 |
| 3 | status 13 (Internal Error) | 같은 케이스를 1회 다시 제출한다. 또 13이면 채점 불가 |
| 4 | status 14 (Exec Format Error) | 채점 불가 |
| 5 | status 6 (Compilation Error) | 컴파일 에러 후보. `compile_output` → `compiler_message`. 다른 SAMPLE 결과가 다 나온 뒤, 다른 케이스가 컴파일됐으면 채점 불가, SAMPLE이 모두 status 6이면 컴파일 에러다. 확정은 [제출 판정 합치기](#제출-판정-합치기) 1번이 한다 |
| 6 | Python, **SAMPLE 케이스**, status 11, stderr에 `Traceback (most recent call last):`가 없고 마지막 줄이 `SyntaxError`·`IndentationError`·`TabError`로 시작 | `COMPILE_ERROR`. stderr(7절대로 정리) → `compiler_message`. 다른 SAMPLE이 판정됐어도 컴파일 에러로 둔다(합치기 1번) |
| 7 | status 5 | `TIME_LIMIT_EXCEEDED` |
| 8 | status 3이 아니면서 stdout·stderr 중 하나의 바이트 길이가 `limit_bytes` 이상, 또는 status 8, 또는 신호 25 | `OUTPUT_LIMIT_EXCEEDED` |
| 9 | 신호 9이고 `memory ≥ memory_limit` | `MEMORY_LIMIT_EXCEEDED` |
| 10 | status 7·9·10·11·12이고, Python 예외 이름(5절)이 `MemoryError` 또는 C++ stderr에 `std::bad_alloc` | `MEMORY_LIMIT_EXCEEDED` |
| 11 | status 7·9·10·11·12 (위에 해당하지 않음) | `RUNTIME_ERROR`. 종류는 4절 |
| 12 | status 3 | API 서버가 출력을 비교해 `ACCEPTED`·`PRESENTATION_ERROR`·`WRONG_ANSWER` (AI_FEATURES 10절 규칙). 비교는 base64를 푼 원본 바이트로 하고, 저장용 변환(깨진 바이트·NUL을 `U+FFFD`로 바꾸고 65,536자로 자르기, `database-schema.md`)은 비교가 끝난 뒤에 한다 |
| 13 | status 4 | 12와 같이 판정하고 경고를 남긴다. `expected_output`을 보냈다는 뜻이라 연동 버그다 |
| 14 | 그 밖의 status | 채점 불가, 오류 로그 |

- 6번은 SAMPLE 케이스에만 적용한다. 진짜 문법 오류는 코드를 읽는 단계에서 나므로 입력과 상관없이 모든 케이스에서 똑같이 나오고, 예제 케이스에서 반드시 잡힌다. 비공개(HIDDEN) 케이스에서 같은 모양이 나오면 학생 코드가 stderr를 꾸민 것이다. 이때는 11번(런타임 에러 `OTHER`)으로 두고, stderr는 7절대로 공개하지 않는다. stderr만 보고 컴파일 에러로 분류하면 `SyntaxError:` 줄에 비공개 입력을 붙여 `compiler_message`로 빼낼 수 있다. 5번(C++)도 같은 이유로 컴파일 에러를 SAMPLE 케이스에서 확정한다. 그래서 문제마다 SAMPLE 케이스가 하나 이상 있어야 하고, 문제를 등록할 때 검사한다.
- 8번의 길이 조건은 정상 종료(status 3)에는 쓰지 않는다. 파일 크기 제한은 한도를 넘겨 쓰려 할 때 걸리므로 정확히 `limit_bytes`만큼 쓰고 정상 종료하는 출력이 있을 수 있다. 실제로 넘친 출력은 비정상 종료한다(C++ 신호 25, Python `exit_code` 1·120). 정상 종료한 출력은 12번 비교로 넘긴다.
- 백준은 Python 코드를 실행 전에 `py_compile`로 검사해 문법 오류를 컴파일 에러로 낸다. 우리는 따로 검사하는 단계가 없어 예제 케이스의 실행 결과로 같은 판정을 낸다. `exec()` 안에서 난 SyntaxError는 머리줄이 있어 런타임 에러로 분류된다.
- 9번은 `memory` 값과 함께 본다. 신호 9인데 `memory`가 제한보다 작으면 메모리 초과가 아니므로 런타임 에러(기타)로 두고 로그를 남긴다.
- 끝없는 재귀는 스택 제한이 메모리 제한과 같아서(1절 `stack_limit`) 9번의 메모리 초과로 판정된다. C++에서 스택 넘침과 메모리 초과는 응답만으로 구분할 수 없다.
- 10번의 stderr 문자열은 학생 코드가 직접 출력할 수도 있다. 실패 status에만 적용하므로, 그렇게 해서 얻는 것은 '런타임 에러'가 '메모리 초과'로 바뀌는 것뿐이라 그대로 둔다. 정상 종료(status 3)한 풀이는 `MemoryError`를 잡아 stderr에 기록했더라도 12번의 출력 비교로 판정한다.

### 제출 판정 합치기

케이스 판정을 제출 하나(`submissions`)의 값으로 합치는 규칙이다. 케이스 순서는 SAMPLE 먼저, 같은 종류 안에서는 `ordinal` 순이다(AI_FEATURES 10절 "공개 예제부터").

1. SAMPLE 케이스에서 `COMPILE_ERROR`(5·6번)가 나오면 그 자리에서 제출을 끝낸다. `submissions.verdict = 'COMPILE_ERROR'`로 두고 메시지는 `compiler_message`에 넣는다. 케이스 행의 `verdict`는 비워 둔다(`submission_test_results.verdict`에는 `COMPILE_ERROR`가 없다). HIDDEN 케이스 결과는 기다리지 않는다. 6번(Python 문법 오류)은 학생 코드의 stderr로 정한 것이라 SAMPLE에서 바로 컴파일 에러로 확정한다. 그래야 학생이 SAMPLE 하나에서만 문법 오류 모양을 찍어 채점 불가(시도 횟수 제외)를 만들 수 없다. 5번(status 6)은 다른 SAMPLE 결과가 다 나올 때까지 기다린 뒤 정한다. 다른 케이스가 하나라도 컴파일에 성공해 판정이 났다면(SAMPLE이든 HIDDEN이든) status 6인 케이스는 채점 불가로 보고 2번으로 끝내고, SAMPLE이 모두 status 6이면 컴파일 에러다. 진짜 컴파일 에러는 모든 SAMPLE이 곧바로 status 6으로 끝나 기다려도 늦어지지 않고, 결과가 도착한 순서와 상관없이 같은 판정이 난다. HIDDEN 케이스의 status 6은 SAMPLE 결과가 아직이면 기다린다. SAMPLE 케이스가 없는 실행은 컴파일 에러를 확정할 근거가 없어 채점 불가다. 진짜 컴파일 에러는 모든 케이스에서 똑같이 나므로, 한 케이스만 컴파일에 실패했다면(VM 메모리 부족 등) 학생 코드 탓이 아니다.
2. 채점 불가인 케이스가 나오면 그 자리에서 제출을 `job_status = 'JUDGE_ERROR'`, `verdict = NULL`로 끝낸다.
3. 그 밖에는 실행 대상 케이스의 판정이 모두 모인 뒤(`database-schema.md`) 정한다. 모두 `ACCEPTED`면 `ACCEPTED`, 아니면 케이스 순서상 처음으로 `ACCEPTED`가 아닌 케이스의 판정이다.
4. `runtime_error_type`은 3에서 고른 케이스가 `RUNTIME_ERROR`일 때 그 케이스의 종류(4절)다. 그 밖에는 `NULL`이다. 종류는 케이스 결과를 받을 때 정해 케이스 행에 저장한다. 비공개 케이스는 stderr를 저장하지 않아 나중에 다시 구할 수 없고, 재시작 복구도 판정이 빈 행만 다시 조회하기 때문이다(`database-schema.md`). V1의 `submission_test_results`에는 이 컬럼이 없으므로 #29에서 마이그레이션으로 `runtime_error_type`을 더한다.
5. `execution_time_ms`·`memory_used_kb`는 판정이 난 케이스 값의 최댓값이다(`time`(초) × 1000 반올림, `memory`(KB)). 1·2로 끝난 제출은 `NULL`이다.
6. `progress`는 판정이 채워진 케이스 수 ÷ 실행 대상 케이스 수 × 100(내림)이다. 1·2번으로 끝난 제출은 판정이 빈 케이스가 남아도 100으로 둔다.

## 4. 런타임 에러 종류

`runtime_error_type`에 넣는 값과 화면 표시다. 화면 문구와 설명은 AI_FEATURES 10절 "런타임 에러 종류별 설명" 표를 쓴다. 저장 코드는 제안이며 #29에서 API 계약과 함께 확정한다.

| 저장 코드(제안) | 화면 표시 | Python 예외(5절) | C++ (신호, stderr) |
|---|---|---|---|
| `INDEX_ERROR` | IndexError / Segfault | `IndexError` | 신호 11 (SIGSEGV, `exit_code` 139), 또는 신호 6이고 stderr에 `std::out_of_range` |
| `ZERO_DIVISION` | ZeroDivisionError / DivisionByZero | `ZeroDivisionError` | 신호 8 (SIGFPE, `exit_code` 136) |
| `VALUE_ERROR` | ValueError | `ValueError` | 신호 6이고 stderr에 `std::invalid_argument` (`stoi` 등) |
| `NAME_ERROR` | NameError | `NameError`, `UnboundLocalError` | — (컴파일 에러로 잡힌다) |
| `TYPE_ERROR` | TypeError | `TypeError` | — |
| `RECURSION_ERROR` | RecursionError / StackOverflow | `RecursionError` | — (3절: 메모리 초과로 판정) |
| `EOF_ERROR` | EOFError | `EOFError` | — |
| `OTHER` | 런타임 에러 (기타) | 위 7개가 아닌 예외(`KeyError`, `AttributeError`, `AssertionError`, 사용자 정의 예외 등), 트레이스백 없는 비정상 종료(`sys.exit(1)`) | 신호 6의 그 밖의 경우(`assert`, `throw 42`, `exit_code` 134), 신호 없이 0이 아닌 종료 코드, 그 밖의 신호 |

## 5. Python 예외 이름 읽기

1. stderr에서 7절의 bash 메시지 줄을 지운다.
2. 마지막 `Traceback (most recent call last):` 줄 이후만 본다. 그 앞의 디버그 출력은 무시한다(학생이 `ValueError` 같은 단어를 stderr에 찍어도 영향이 없다).
3. 그 구간에서 머리줄 다음으로 들여쓰기 없이 시작하는 첫 줄이 예외 줄이다(트레이스백의 파일·코드 줄은 들여쓰기돼 있다). 이 줄에서 `^([A-Za-z_][\w.]*)(:|$)`로 이름을 뽑고, 모듈 접두어(`__main__.`)를 떼어 마지막 부분만 쓴다. 마지막 줄을 보면 안 된다. 메시지에 줄바꿈이 있는 예외(`ValueError("bad\ninput")`)에서는 마지막 줄이 메시지의 둘째 줄이다.
4. 트레이스백이 없거나, 예외 줄이 없거나 정규식이 맞지 않으면 이름이 없는 것으로 보고 `OTHER`다(단, 3절 6번의 문법 오류 확인이 먼저다).

| stderr 마지막 부분 (관찰) | 이름 | 결과 |
|---|---|---|
| `IndexError: list index out of range` | IndexError | 런타임 에러 `INDEX_ERROR` |
| `debug ValueError: …` 뒤에 트레이스백, 예외 줄 `IndexError: …` | IndexError | 런타임 에러 `INDEX_ERROR` |
| `__main__.MyError: boom` | MyError | 런타임 에러 `OTHER` |
| `UnboundLocalError: local variable 'x' referenced before assignment` | UnboundLocalError | 런타임 에러 `NAME_ERROR` |
| 머리줄 없이 `SyntaxError: unexpected EOF while parsing` (SAMPLE 케이스) | — | 컴파일 에러 |
| (`null`, `exit_code` 1) | — | 런타임 에러 `OTHER` |
| 예외 줄 `ValueError: bad` 다음에 `input` | ValueError | 런타임 에러 `VALUE_ERROR` |

마지막 행은 #66 케이스가 아니라 트레이스백 형식에서 나온 예다.

## 6. 채점 서버 오류와 재시도

| 상황 | 처리 |
|---|---|
| 401·403 | 설정 오류(토큰). 재시도하지 않고 `JUDGE_ERROR`, 운영 알림 |
| 422 | 요청 값 오류. 재시도하지 않고 `JUDGE_ERROR`, 운영 알림. 제한값이 서버가 받는 범위를 벗어나도 422가 나므로 문제 등록 때 막는다(1절) |
| 묶음 제출의 항목 오류 | 일부 항목만 잘못되면 201, 모두 잘못되면 422로 오고 둘 다 항목별 목록이다. `token`이 없는 항목이 하나라도 있으면 422와 같이 재시도하지 않고 제출을 `JUDGE_ERROR`로 끝낸다. 토큰을 받은 다른 항목의 결과는 쓰지 않는다 |
| 503 (`queue is full`) | 지수 백오프로 재시도. 한도를 넘기면 `JUDGE_ERROR` |
| 연결 오류·타임아웃·5xx (결과 조회) | 같은 GET을 백오프로 재시도 |
| 404 (결과 조회) | 토큰이 채점 서버에 없다(Judge0 DB를 새로 만든 경우 등). 다시 물어도 같으므로 재시도하지 않고 `JUDGE_ERROR`, 오류 로그 |
| 연결 오류·타임아웃·5xx (제출 POST) | 응답(토큰)을 받지 못하면 같은 요청을 자동으로 다시 보내지 않고 `JUDGE_ERROR`로 끝낸다. 제출이 이미 들어갔을 수 있어, 다시 보내면 같은 코드가 두 번 실행된다. 재시작 복구에서 행은 있는데 토큰이 빈 케이스도 같은 이유로 다시 보내지 않는다(`database-schema.md`) |
| 폴링 기한 초과 | `cpu_time_limit`가 아니라 큐 대기까지 고려한 기한이다. 넘기면 `JUDGE_ERROR` |
| status 13·14, 14번 행 | 3절 |

`JUDGE_ERROR`인 제출은 시도 횟수에 넣지 않는다(`database-tables.md` `user_problem_stats`).

## 7. 학생에게 보여 줄 메시지 정리

- stderr에서 `^run: line \d+:` 로 시작하는 줄을 지운다. Judge0 내부 경로(`/usr/local/python-3.8.1/bin/python3`, `LD_LIBRARY_PATH=…`)가 들어 있다.
- 예외 원문과 줄 번호는 공개 예제(SAMPLE)에서만 보여 준다. 비공개 테스트에서는 종류(4절)만 보여 준다(AI_FEATURES 10절).
- 컴파일 에러 메시지(`compile_output`, Python 문법 오류의 stderr)는 결과 화면에서 보여 준다(AI_FEATURES 10절 컴파일 에러 행). 컴파일 에러는 SAMPLE 케이스에서만 확정하므로(3절 5·6번) 메시지도 SAMPLE 케이스의 것을 쓴다.

## 8. 관찰 근거

아래 케이스 이름은 #66 검증 케이스다. #66에서 결과 표(`judge/verify/results/`)와 케이스별 관찰 JSON(`judge/verify/observed/<환경>/<케이스>.json`)을 함께 올린다. #29의 단위 테스트는 이 JSON의 `result`를 입력으로 쓸 수 있다. 다만 관찰 JSON은 stdout·stderr·compile_output을 2,000자로 자르고 `... (총 N자)`를 붙여 저장한다. 출력 초과 케이스(`ole_*`)는 출력을 그 길이만큼 다시 채워 넣어야 8번 규칙을 시험할 수 있다.

| 규칙 | 근거 케이스 | 관찰 |
|---|---|---|
| 신호 → status 11 + `exit_code` 128+N | `cpp_nullptr_cpp`, `cpp_divzero_cpp`, `cpp_assert_cpp`, `ole_stdout_cpp` | 139, 136, 134, 153. `exit_signal` 없음 |
| 메모리 초과 | `mle_list_py`, `mle_touch_py`, `mle_vector_cpp`, `mle_grow_cpp` | status 11, `exit_code` 137, `memory` 262144 = 제한 |
| 끝없는 재귀 | `rec_deep_py`, `rec_deep_cpp` | 메모리 초과와 같은 응답 |
| 출력 초과 | `ole_stdout_py`, `ole_stderr_py`, `ole_stdout_cpp` | 출력이 1,048,576바이트(= 1024 KB)에서 잘림. `exit_code` 1·120·153 |
| 시간 초과 | `tle_loop_py`, `tle_loop_cpp`, `tle_sleep_py` | status 5. CPU 2.1초 / wall 5.0초 |
| Python 예외 이름 | `exc_*_py` 14개 | 트레이스백의 예외 줄 |
| Python 문법 오류 | `exc_syntax_py`, `exc_indent_py` | status 11, 트레이스백 머리줄 없음 |
| C++ 예외 종류 | `cpp_at_cpp`, `cpp_stoi_cpp`, `cpp_throw_cpp` | 134, stderr `std::out_of_range`·`std::invalid_argument`·`'int'` |
| 컴파일 에러 | `cpp_compile_error_cpp` | status 6 |
| `null` 필드 | `exit_1_py`, `cpp_compile_error_cpp` | stdout·stderr `null` / status 6이면 `time`·`memory`·`exit_code`도 `null` |

## 9. 채점 VM에서 다시 확인할 것

맥 결과는 amd64 명령을 Rosetta로 번역해 실행한 것이다. #66에서 채점 VM에 같은 케이스를 돌려 아래가 같은지 확인하고, 다르면 이 문서를 고친다.

- 신호가 status 11 + `exit_code` 128+N으로 오는지(2절 1번). status 7~10이나 `exit_signal`로 와도 신호 번호 규칙으로 판정은 같다
- 메모리 초과 응답의 `memory`가 제한값과 같은지(3절 9번)
- `::operator new(4 TB)`가 `std::bad_alloc`으로 끝나는지(맥은 `vm.overcommit_memory=1`이라 할당이 성공했다)
- `wall_time_limit` = `cpu_time_limit` × 2 + 1이 동시 실행 중에도 정답 풀이를 끊지 않는지(1절, #65 실측)
