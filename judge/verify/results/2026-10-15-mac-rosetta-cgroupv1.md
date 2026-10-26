# 검증 결과 — mac-rosetta-cgroupv1 · Judge0 1.13.1 · 2026-10-15T12:06:25+09:00

| 케이스 | 묶음 | status | signal | exit | time | wall | memory(KB) | 판정 | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| net_probe_py | network | 3 Accepted |  | 0 | 0.104 | 0.11 | 11924 | ok | dns_example.com: 차단 확인; imds_169.254.169.254:80: 호스트도 닿지 않아 대조 불가; tcp_1.1.1.1:53: 차단 확인; tcp_8.8.8.8:53: 차단 확인 |
| net_probe_cpp | network | 3 Accepted |  | 0 | 0.037 | 0.045 | 4896 | ok | imds_169.254.169.254:80 BLOCKED |
| iso_files_py | files | 3 Accepted |  | 0 | 0.086 | 0.103 | 10480 | ok | uid 60106 BLOCKED |
| iso_fork_py | process | 3 Accepted |  | 0 | 0.167 | 1.102 | 61584 | ok | fork BLOCKED after 58 BlockingIOError |
| tle_loop_py | time | 5 Time Limit Exceeded |  | 0 | 2.092 | 2.101 | 9416 | ok |  |
| tle_loop_cpp | time | 5 Time Limit Exceeded |  | 0 | 2.098 | 2.106 | 4848 | ok |  |
| tle_sleep_py | time | 5 Time Limit Exceeded |  | 0 | 0.07 | 5.005 | 9240 | ok |  |
| mle_list_py | memory | 11 Runtime Error (NZEC) |  | 137 | 0.169 | 0.177 | 262144 | ok | run: line 1:     3 Killed                  /usr/local/python-3.8.1/bin/python3 script.py |
| mle_touch_py | memory | 11 Runtime Error (NZEC) |  | 137 | 0.162 | 0.168 | 262144 | ok | run: line 1:     3 Killed                  /usr/local/python-3.8.1/bin/python3 script.py |
| mle_vector_cpp | memory | 11 Runtime Error (NZEC) |  | 137 | 0.126 | 0.142 | 262144 | ok | run: line 1:     3 Killed                  LD_LIBRARY_PATH=/usr/local/gcc-9.2.0/lib64 ./a.out |
| mle_grow_cpp | memory | 11 Runtime Error (NZEC) |  | 137 | 0.123 | 0.133 | 262144 | ok | run: line 1:     3 Killed                  LD_LIBRARY_PATH=/usr/local/gcc-9.2.0/lib64 ./a.out |
| mle_badalloc_cpp | memory | 3 Accepted |  | 0 | 0.026 | 0.033 | 5452 | 다름: status 3 (기대 [11]), exit_code 0 (기대 [134]), stderr에 bad_alloc 없음 | 0x7bffefa84010 |
| rec_default_py | recursion | 11 Runtime Error (NZEC) |  | 1 | 0.076 | 0.081 | 10468 | ok | RecursionError: maximum recursion depth exceeded |
| rec_deep_py | recursion | 11 Runtime Error (NZEC) |  | 137 | 0.154 | 0.164 | 262144 | ok | run: line 1:     3 Killed                  /usr/local/python-3.8.1/bin/python3 script.py |
| rec_deep_ok_py | recursion | 3 Accepted |  | 0 | 0.108 | 0.118 | 91520 | ok | 100000 |
| rec_deep_cpp | recursion | 11 Runtime Error (NZEC) |  | 137 | 0.082 | 0.089 | 262144 | ok | run: line 1:     3 Killed                  LD_LIBRARY_PATH=/usr/local/gcc-9.2.0/lib64 ./a.out |
| rec_ok_cpp | recursion | 3 Accepted |  | 0 | 0.027 | 0.029 | 5124 | ok | 1000000 |
| ole_stdout_py | output | 11 Runtime Error (NZEC) |  | 1 | 0.075 | 0.087 | 10900 | ok | OSError: [Errno 27] File too large |
| ole_stderr_py | output | 11 Runtime Error (NZEC) |  | 120 | 0.076 | 0.079 | 10896 | ok | yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy |
| ole_stdout_cpp | output | 11 Runtime Error (NZEC) |  | 153 | 0.026 | 0.035 | 4880 | ok | run: line 1:     3 File size limit exceededLD_LIBRARY_PATH=/usr/local/gcc-9.2.0/lib64 ./a.out |
| ole_ok_py | output | 3 Accepted |  | 0 | 0.077 | 0.087 | 12184 | ok | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx |
| out_bytes_py | output | 3 Accepted |  | 0 | 0.074 | 0.079 | 9356 | ok | �� ok |
| exc_index_py | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.074 | 0.085 | 9716 | ok | IndexError: list index out of range |
| exc_zero_py | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.075 | 0.081 | 9348 | ok | ZeroDivisionError: integer division or modulo by zero |
| exc_value_py | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.074 | 0.085 | 9728 | ok | ValueError: invalid literal for int() with base 10: '1 2' |
| exc_name_py | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.08 | 0.084 | 9208 | ok | NameError: name 'answer' is not defined |
| exc_unbound_py | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.075 | 0.09 | 9660 | ok | UnboundLocalError: local variable 'x' referenced before assignment |
| exc_type_py | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.075 | 0.081 | 9524 | ok | TypeError: can only concatenate str (not "int") to str |
| exc_eof_py | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.084 | 0.092 | 9668 | ok | EOFError: EOF when reading a line |
| exc_key_py | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.077 | 0.084 | 9380 | ok | KeyError: 'k' |
| exc_attr_py | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.085 | 0.102 | 9780 | ok | AttributeError: 'int' object has no attribute 'append' |
| exc_assert_py | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.074 | 0.083 | 9752 | ok | AssertionError |
| exc_custom_py | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.08 | 0.095 | 9804 | ok | __main__.MyError: boom |
| exc_syntax_py | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.084 | 0.092 | 9268 | ok | SyntaxError: unexpected EOF while parsing |
| exc_indent_py | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.072 | 0.083 | 9868 | ok | IndentationError: expected an indented block |
| exc_debug_stderr_py | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.079 | 0.087 | 9540 | ok | IndexError: list index out of range |
| exit_1_py | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.074 | 0.081 | 9540 | ok |  |
| cpp_nullptr_cpp | exceptions | 11 Runtime Error (NZEC) |  | 139 | 0.025 | 0.035 | 4940 | ok | run: line 1:     3 Segmentation fault      LD_LIBRARY_PATH=/usr/local/gcc-9.2.0/lib64 ./a.out |
| cpp_divzero_cpp | exceptions | 11 Runtime Error (NZEC) |  | 136 | 0.025 | 0.034 | 3544 | ok | run: line 1:     3 Floating point exceptionLD_LIBRARY_PATH=/usr/local/gcc-9.2.0/lib64 ./a.out |
| cpp_assert_cpp | exceptions | 11 Runtime Error (NZEC) |  | 134 | 0.028 | 0.04 | 5180 | ok | run: line 1:     3 Aborted                 LD_LIBRARY_PATH=/usr/local/gcc-9.2.0/lib64 ./a.out |
| cpp_at_cpp | exceptions | 11 Runtime Error (NZEC) |  | 134 | 0.03 | 0.041 | 4560 | ok | run: line 1:     3 Aborted                 LD_LIBRARY_PATH=/usr/local/gcc-9.2.0/lib64 ./a.out |
| cpp_stoi_cpp | exceptions | 11 Runtime Error (NZEC) |  | 134 | 0.028 | 0.032 | 4748 | ok | run: line 1:     3 Aborted                 LD_LIBRARY_PATH=/usr/local/gcc-9.2.0/lib64 ./a.out |
| cpp_return1_cpp | exceptions | 11 Runtime Error (NZEC) |  | 1 | 0.025 | 0.039 | 3808 | ok |  |
| cpp_compile_error_cpp | exceptions | 6 Compilation Error |  |  |  |  |  | ok | \| ^ |
| cpp_throw_cpp | exceptions | 11 Runtime Error (NZEC) |  | 134 | 0.026 | 0.037 | 5276 | ok | run: line 1:     3 Aborted                 LD_LIBRARY_PATH=/usr/local/gcc-9.2.0/lib64 ./a.out |

실패 0건 (observe 케이스 제외)
