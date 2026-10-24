import type { Language } from '@/api/types'

export interface BeginnerGuide {
  /**
   * 표준 입력을 읽어 답을 내놓는 가장 짧은 틀.
   *
   * **그대로 붙여 넣어 돌아가는 한 프로그램**이어야 한다. 처음에는 읽는 방법 여러 개를
   * 한 예시에 이어 붙였는데, Python 쪽은 `readline()`이 버퍼를 미리 읽어 뒤의
   * `buffer.read()`가 빈 값을 받고, C++ 쪽은 `cin >>` 다음의 `getline`이 남은 줄바꿈을
   * 읽어 빈 문자열을 받았다. 입문자용 예시가 바로 그 함정을 담고 있던 셈이다.
   * 다른 읽기 방법은 `terms`에서 함정과 함께 설명한다.
   */
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

# 입력을 한 번에 다 읽어 공백과 줄바꿈으로 나눈다.
# 줄을 세지 않아도 되고, 줄이 많아도 느려지지 않는다.
data = sys.stdin.read().split()

# 예: 첫 줄 "4 9", 둘째 줄 "2 7 11 15"
n = int(data[0])
t = int(data[1])
nums = [int(x) for x in data[2 : 2 + n]]

print(nums[0] + t)  # 답은 표준 출력으로. 꾸미는 말을 붙이지 않는다
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
        term: '줄 단위로 읽고 싶다면',
        meaning:
          '`sys.stdin.readline()`으로 한 줄씩 읽습니다. 끝에 줄바꿈이 붙어 있으니 문자열을 그대로 비교할 때는 `.rstrip()`으로 떼야 합니다. **한 프로그램에서 `readline()`과 `read()`를 섞지 마세요** — 앞의 `readline()`이 뒤에 올 입력까지 미리 읽어 두어서, 이어지는 `read()`가 빈 값을 돌려받습니다.',
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

    // 예: 첫 줄 "4 9", 둘째 줄 "2 7 11 15"
    int n, t;
    cin >> n >> t;  // 공백과 줄바꿈은 알아서 넘어간다

    vector<int> nums(n);
    for (int i = 0; i < n; i++) cin >> nums[i];

    cout << nums[0] + t << '\\n';  // 답은 표준 출력으로
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
      {
        term: '줄 단위로 읽고 싶다면',
        meaning:
          '`getline(cin, line)`으로 한 줄을 통째로 읽습니다. **`cin >>` 바로 뒤에 쓰면 빈 문자열이 나옵니다** — `cin >>`이 읽고 남긴 줄바꿈을 `getline`이 그 줄의 끝으로 보기 때문입니다. 먼저 `cin.ignore()`로 그 줄바꿈을 버리세요.',
      },
    ],
  },
}
