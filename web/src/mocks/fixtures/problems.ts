import type { ConceptTag, ProblemSummary } from '@/api/provisional'

export const conceptTags: ConceptTag[] = [
  { slug: 'array', name: '배열' },
  { slug: 'string', name: '문자열' },
  { slug: 'hash', name: '해시' },
  { slug: 'dp', name: '동적 계획법' },
]

/**
 * 필터 조합을 시험할 수 있게 난이도·태그·풀이 상태를 골고루 섞었다.
 *
 * 난이도가 EASY/MEDIUM/HARD 셋 다 있어야 정렬 테스트가 의미를 갖는다.
 * 문자열 정렬(EASY, HARD, MEDIUM)과 순위 정렬(EASY, MEDIUM, HARD)이
 * 다른 결과를 내야 그 테스트가 실패할 수 있다.
 */
const handWritten: ProblemSummary[] = [
  {
    id: 1,
    slug: 'two-sum',
    title: '두 수의 합',
    difficulty: 'EASY',
    tags: [{ slug: 'array', name: '배열' }],
    solveStatus: 'SOLVED',
  },
  {
    id: 2,
    slug: 'reverse-string',
    title: '문자열 뒤집기',
    difficulty: 'EASY',
    tags: [{ slug: 'string', name: '문자열' }],
    solveStatus: 'UNSOLVED',
  },
  {
    id: 3,
    slug: 'valid-parentheses',
    title: '올바른 괄호',
    difficulty: 'MEDIUM',
    tags: [
      { slug: 'string', name: '문자열' },
      { slug: 'hash', name: '해시' },
    ],
    solveStatus: 'WRONG',
  },
  {
    id: 4,
    slug: 'group-anagrams',
    title: '애너그램 묶기',
    difficulty: 'MEDIUM',
    tags: [{ slug: 'hash', name: '해시' }],
    solveStatus: 'UNSOLVED',
  },
  {
    id: 5,
    slug: 'longest-increasing-subsequence',
    title: '가장 긴 증가 부분 수열',
    difficulty: 'HARD',
    tags: [{ slug: 'dp', name: '동적 계획법' }],
    solveStatus: 'WRONG',
  },
  {
    id: 6,
    slug: 'edit-distance',
    title: '편집 거리',
    difficulty: 'HARD',
    tags: [
      { slug: 'dp', name: '동적 계획법' },
      { slug: 'string', name: '문자열' },
    ],
    solveStatus: 'UNSOLVED',
  },
  {
    id: 7,
    slug: 'merge-intervals',
    title: '구간 합치기',
    difficulty: 'MEDIUM',
    tags: [{ slug: 'array', name: '배열' }],
    solveStatus: 'SOLVED',
  },
  {
    id: 8,
    slug: 'rotate-array',
    title: '배열 회전',
    difficulty: 'EASY',
    tags: [{ slug: 'array', name: '배열' }],
    solveStatus: 'UNSOLVED',
  },
]

/**
 * 2페이지를 만들기 위한 채움 문제 (LIST-05, 한 페이지 20개).
 *
 * 손으로 쓴 여덟 개는 필터·정렬·검색 테스트가 값을 하나하나 읽으므로 건드리지 않고,
 * 전체가 25개가 되도록 기계적으로 덧붙인다 — 1페이지 20개, 2페이지 5개가 되어
 * 두 페이지 모두 비어 있지 않다.
 *
 * 값을 일부러 한 가지로 고정했다 — 손으로 쓴 여덟 개에 걸어 둔 필터 테스트가
 * 정확한 번호 목록을 단언하기 때문이다. 난이도 MEDIUM, 태그 '배열', 상태 '안 품'이면
 * 태그(`dp`)·상태(`SOLVED`)·조합(`MEDIUM`+`hash`) 테스트의 답이 그대로 남는다.
 * 난이도만은 피할 수 없다(어느 값이든 하나는 늘어난다). 제목에 '두'·'합'을 넣지
 * 않는다 — 그 두 글자로 검색하는 테스트가 있다.
 */
const filler: ProblemSummary[] = Array.from({ length: 17 }, (_, index) => ({
  id: handWritten.length + index + 1,
  slug: `practice-${handWritten.length + index + 1}`,
  title: `연습 문제 ${handWritten.length + index + 1}`,
  difficulty: 'MEDIUM' as const,
  tags: [conceptTags[0]!],
  solveStatus: 'UNSOLVED' as const,
}))

export const problems: ProblemSummary[] = [...handWritten, ...filler]
