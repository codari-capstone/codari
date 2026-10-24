import type { Language } from '@/api/types'

export interface BeginnerGuide {
  /** 표준 입력을 읽어 답을 내놓는 가장 짧은 틀. */
  readingExample: string
  /** 그 예시에 나오는 말들. 제목과 뜻. */
  terms: { term: string; meaning: string }[]
}

/**
 * 입문자 안내 (SOLVE-07).
 *
 * 문제마다 다르지 않아 상세 응답에 없다 — 계약이 "화면이 언어별 고정 문구로 보여 준다"로
 * 정했다. 그래서 판정 설명(errors.ts)과 같이 서버를 거치지 않는 상수로 둔다.
 *
 * 입문자가 막히는 자리는 알고리즘이 아니라 **표준 입력**이다. 백준식 채점은 함수를
 * 채우는 방식이 아니라 입력을 직접 읽어 출력까지 내놓아야 해서, 처음 오는 사람은
 * 풀이를 알아도 제출을 못 한다. 그 한 걸음만 떼게 하는 것이 이 안내의 목적이다.
 */
export const BEGINNER_GUIDE: Record<Language, BeginnerGuide> = {
  PYTHON: {
    readingExample: `import sys

# 한 줄씩 읽는다. 끝의 줄바꿈은 빼야 한다
first = sys.stdin.readline().rstrip()

# 한 줄에 여러 수가 공백으로 올 때
n, t = map(int, sys.stdin.readline().split())

# 입력이 아주 많으면 한 번에 다 읽는 쪽이 빠르다
data = sys.stdin.buffer.read().split()

print(n + t)  # 답은 표준 출력으로
`,
    terms: [
      {
        term: '표준 입력 (stdin)',
        meaning:
          '채점 서버가 문제의 입력 데이터를 프로그램에 넣어 주는 통로입니다. 파일을 열지 않고 여기서 읽습니다.',
      },
      {
        term: '표준 출력 (stdout)',
        meaning:
          '`print`로 쓰는 곳입니다. 채점은 여기 찍힌 글자만 봅니다 — "답: "처럼 꾸미는 말을 붙이면 틀립니다.',
      },
      {
        term: '`input()` 대신 `sys.stdin`',
        meaning:
          '`input()`은 줄 수가 많아지면 느립니다. 입력이 10만 줄쯤 되는 문제에서 시간 초과의 흔한 원인입니다.',
      },
      {
        term: '`rstrip()`',
        meaning:
          '읽은 줄의 끝에는 줄바꿈 문자가 붙어 있습니다. 문자열을 그대로 비교할 때는 떼야 합니다.',
      },
    ],
  },
  CPP: {
    readingExample: `#include <bits/stdc++.h>
using namespace std;

int main() {
    // 이 두 줄이 없으면 입력이 많을 때 느리다
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, t;
    cin >> n >> t;  // 공백과 줄바꿈은 알아서 넘어간다

    string line;
    getline(cin, line);  // 줄 하나를 통째로 읽을 때

    cout << n + t << '\\n';  // 답은 표준 출력으로
    return 0;
}
`,
    terms: [
      {
        term: '표준 입력 (cin)',
        meaning:
          '채점 서버가 문제의 입력 데이터를 프로그램에 넣어 주는 통로입니다. 파일을 열지 않고 여기서 읽습니다.',
      },
      {
        term: '표준 출력 (cout)',
        meaning:
          '답을 쓰는 곳입니다. 채점은 여기 찍힌 글자만 봅니다 — "답: "처럼 꾸미는 말을 붙이면 틀립니다.',
      },
      {
        term: '`sync_with_stdio(false)`',
        meaning:
          'C 입출력과의 동기화를 끊어 `cin`·`cout`을 빠르게 합니다. 입력이 많은 문제에서 시간 초과를 막는 한 줄입니다.',
      },
      {
        term: '`endl` 대신 `\\n`',
        meaning:
          '`endl`은 줄바꿈마다 버퍼를 비워 느립니다. 줄을 많이 출력하는 문제에서는 `\\n`을 씁니다.',
      },
    ],
  },
}
