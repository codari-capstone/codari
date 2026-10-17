import type { ProblemDetailView } from '@/api/types'
import { problems } from './problems'

const PYTHON_STARTER = `import sys


def solve():
    data = sys.stdin.read().split()
    print(len(data))


solve()
`

const CPP_STARTER = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    return 0;
}
`

/**
 * 언어별 제한과 시작 코드. 계약이 PYTHON, CPP 순서를 보장하므로 그 순서로 둔다.
 *
 * Python이 C++보다 느려서 시간 제한이 두 배다 (언어별 보정은 #72가 서버에서 정한다).
 */
const LANGUAGES: ProblemDetailView['languages'] = [
  { language: 'PYTHON', timeLimitMs: 2000, memoryLimitMb: 256, starterCode: PYTHON_STARTER },
  { language: 'CPP', timeLimitMs: 1000, memoryLimitMb: 256, starterCode: CPP_STARTER },
]

/**
 * 손으로 쓴 세 문제. 나머지는 아래에서 목록 fixture로 만든다.
 *
 * 출처·라이선스가 각각 다르다 — 계약에서 셋 다 null일 수 있고(`sourceName`·`sourceUrl`·
 * `license`), 화면은 없는 줄을 빼야 한다(SOLVE-03). 세 가지 조합을 모두 둔다.
 *   1번 — 셋 다 있음(링크 걸린 출처)
 *   2번 — 셋 다 없음
 *   3번 — 출처 이름만 있고 링크는 없음 + 라이선스 있음
 */
const overrides: Record<number, Partial<ProblemDetailView>> = {
  1: {
    statementMarkdown: `정수 배열과 목표값이 주어진다. 두 수를 더해 목표값이 되는 **서로 다른** 두 위치를 찾아라.

답이 여러 개면 아무 것이나 출력해도 된다. 시간 복잡도 $O(n)$으로 풀 수 있다.

- 같은 원소를 두 번 쓸 수 없다
- 답이 없는 경우는 입력으로 주어지지 않는다

\`\`\`python
# 해시로 한 번만 훑으면 된다
seen = {}
\`\`\``,
    inputDescription: `첫 줄에 원소 개수 N과 목표값 T가 공백으로 주어진다.
둘째 줄에 N개의 정수가 공백으로 주어진다.`,
    outputDescription: '두 위치를 오름차순으로 한 줄에 출력한다. 위치는 0부터 센다.',
    constraintsMarkdown: '- $2 \\le N \\le 10^5$\n- $-10^9 \\le$ 각 원소 $\\le 10^9$',
    sourceName: 'LeetCode 1. Two Sum',
    sourceUrl: 'https://leetcode.com/problems/two-sum/',
    license: 'CC BY-SA 4.0',
    samples: [
      { input: '4 9\n2 7 11 15\n', output: '0 1\n' },
      { input: '3 6\n3 2 4\n', output: '1 2\n' },
    ],
  },
  2: {
    statementMarkdown: '문자열이 주어지면 뒤집어 출력하라.',
    inputDescription: '첫 줄에 문자열 S가 주어진다.',
    outputDescription: 'S를 뒤집어 한 줄에 출력한다.',
    constraintsMarkdown: '',
    samples: [{ input: 'codari\n', output: 'iradoc\n' }],
  },
  3: {
    statementMarkdown: '괄호 문자열이 올바른지 판단하라.',
    sourceName: '직접 제작',
    sourceUrl: null,
    license: 'CC0 1.0',
    versionNo: 2,
  },
}

/**
 * 문제 상세 목(SOLVE-01~04·06).
 *
 * 목록 fixture에서 만들어 제목·난이도·태그가 두 응답에서 어긋나지 않게 한다. 목록에서
 * 들어간 문제의 상세가 404가 되는 일도 이 방식이라 생기지 않는다.
 */
export const problemDetails: ProblemDetailView[] = problems.map((summary) => ({
  id: summary.id,
  slug: summary.slug,
  versionNo: 1,
  title: summary.title,
  difficulty: summary.difficulty,
  tags: summary.tags,
  statementMarkdown: `연습용 지문이다. 수를 하나 읽어 그대로 출력하라.`,
  inputDescription: '첫 줄에 정수 N이 주어진다.',
  outputDescription: 'N을 한 줄에 출력한다.',
  constraintsMarkdown: '- $1 \\le N \\le 100$',
  sourceName: null,
  sourceUrl: null,
  license: null,
  samples: [{ input: '7\n', output: '7\n' }],
  languages: LANGUAGES,
  ...overrides[summary.id],
}))
