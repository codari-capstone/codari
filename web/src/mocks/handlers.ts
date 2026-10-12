import { http, HttpResponse, type RequestHandler } from 'msw'

import { DIFFICULTY_RANK, type Difficulty, type SolveStatus } from '@/api/provisional'
import { conceptTags, problems } from './fixtures/problems'

/**
 * MSW 가짜 응답. 명세(#2)가 확정되면 응답 형태를 실제 명세에 맞춘다.
 *
 * 걸러내기와 정렬을 여기서 한다. 실제 API(#25 PROBLEM-002)가 서버 측 검색·필터이므로
 * 화면이 받은 걸 그리기만 하게 두어야, API가 붙는 날 화면 코드를 고치지 않는다.
 *
 * 경로를 '*\/api/...'로 쓰는 이유: baseUrl이 window.location.origin이고 그 값이
 * 개발 서버와 jsdom에서 다르다. 와일드카드로 두면 양쪽에서 같은 핸들러가 걸린다.
 */
export const handlers: RequestHandler[] = [
  http.get('*/api/concept-tags', () => HttpResponse.json(conceptTags)),

  http.get('*/api/problems', ({ request }) => {
    const query = new URL(request.url).searchParams

    const keyword = query.get('keyword')?.trim() ?? ''
    const difficulties = query.getAll('difficulty') as Difficulty[]
    const tags = query.getAll('tag')
    const statuses = query.getAll('status') as SolveStatus[]
    const [field, direction] = (query.get('sort') ?? 'id,asc').split(',')

    const matched = problems.filter((problem) => {
      if (keyword && !problem.title.includes(keyword)) return false
      if (difficulties.length > 0 && !difficulties.includes(problem.difficulty)) return false
      if (tags.length > 0 && !problem.tags.some((tag) => tags.includes(tag.slug))) return false
      // 이 핸들러는 인증을 모른다(의도된 선택이다). 그래서 비로그인 요청에서도 status를
      // 그대로 걸러 낸다. contracts/problems-list-proposal.md는 실제 서버가 비로그인 요청의
      // status를 무시하고 전체 목록을 주도록 요청한다. 즉 이 동작은 그 점에서 명세가 아니다 —
      // mock을 근거로 "비로그인도 status로 걸러진다"고 읽지 말 것. 로그인 사용자의 동작만 모사한다.
      if (statuses.length > 0) {
        if (!problem.solveStatus || !statuses.includes(problem.solveStatus)) return false
      }
      return true
    })

    // 난이도는 DIFFICULTY_RANK로 정렬한다. 문자열 비교는 EASY, HARD, MEDIUM이 된다.
    const sorted = [...matched].sort((a, b) =>
      field === 'difficulty'
        ? DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty]
        : a.id - b.id,
    )
    if (direction === 'desc') sorted.reverse()

    return HttpResponse.json({ content: sorted, totalElements: sorted.length })
  }),
]
