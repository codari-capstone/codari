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
export const problems: ProblemSummary[] = [
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
