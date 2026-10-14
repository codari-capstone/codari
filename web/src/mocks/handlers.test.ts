import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import {
  provisionalApi,
  type Page,
  type ProblemListQuery,
  type ProblemSummary,
} from '@/api/provisional'
import { conceptTags } from './fixtures/problems'
import { SESSION_COOKIE } from './fixtures/users'
import { server } from './server'

async function fetchProblems(query: ProblemListQuery): Promise<Page<ProblemSummary>> {
  const { data, error } = await provisionalApi.GET('/api/problems', { params: { query } })
  if (error || !data) throw new Error('핸들러가 응답하지 않았다')
  return data
}

describe('MSW 문제 목록 핸들러', () => {
  it('필터가 없으면 전체를 번호순으로 돌려준다', async () => {
    const page = await fetchProblems({})

    expect(page.content.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(page.totalElements).toBe(8)
  })

  it('keyword로 제목을 걸러낸다', async () => {
    const page = await fetchProblems({ keyword: '문자열' })

    expect(page.content.map((p) => p.title)).toEqual(['문자열 뒤집기'])
    expect(page.totalElements).toBe(1)
  })

  it('난이도를 여러 개 고르면 OR로 걸러낸다', async () => {
    const page = await fetchProblems({ difficulty: ['HARD', 'MEDIUM'] })

    expect(page.content.map((p) => p.id)).toEqual([3, 4, 5, 6, 7])
  })

  it('태그로 걸러낸다', async () => {
    const page = await fetchProblems({ tag: ['dp'] })

    expect(page.content.map((p) => p.id)).toEqual([5, 6])
  })

  it('풀이 상태로 걸러낸다', async () => {
    const page = await fetchProblems({ status: ['SOLVED'] })

    expect(page.content.map((p) => p.id)).toEqual([1, 7])
  })

  it('필터를 함께 주면 AND로 좁힌다', async () => {
    const page = await fetchProblems({ difficulty: ['MEDIUM'], tag: ['hash'] })

    expect(page.content.map((p) => p.id)).toEqual([3, 4])
  })

  // 이 테스트가 핵심이다. 문자열 비교로 정렬하면 EASY, HARD, MEDIUM이 된다.
  it('난이도 정렬은 알파벳순이 아니라 EASY → MEDIUM → HARD다', async () => {
    const page = await fetchProblems({ sort: 'difficulty,asc' })

    expect(page.content.map((p) => p.difficulty)).toEqual([
      'EASY',
      'EASY',
      'EASY',
      'MEDIUM',
      'MEDIUM',
      'MEDIUM',
      'HARD',
      'HARD',
    ])
  })

  it('난이도 내림차순은 HARD부터다', async () => {
    const page = await fetchProblems({ sort: 'difficulty,desc' })

    expect(page.content[0].difficulty).toBe('HARD')
    expect(page.content.at(-1)?.difficulty).toBe('EASY')
  })

  it('번호 내림차순', async () => {
    const page = await fetchProblems({ sort: 'id,desc' })

    expect(page.content.map((p) => p.id)).toEqual([8, 7, 6, 5, 4, 3, 2, 1])
  })

  it('조건에 맞는 게 없으면 빈 목록과 0을 돌려준다', async () => {
    const page = await fetchProblems({ keyword: '존재하지않는제목' })

    expect(page.content).toEqual([])
    expect(page.totalElements).toBe(0)
  })

  it('개념 태그 목록을 돌려준다', async () => {
    const { data } = await provisionalApi.GET('/api/concept-tags')

    expect(data).toEqual(conceptTags)
  })

  // 배열 파라미터가 반복 키로 나가는지 확인한다. 쉼표로 합쳐 나가면
  // 서버가 'HARD,MEDIUM'이라는 한 값으로 받아 필터가 전부 어긋난다.
  it('배열 파라미터는 반복 키로 직렬화된다', async () => {
    let captured = ''
    server.use(
      http.get('*/api/problems', ({ request }) => {
        captured = new URL(request.url).search
        return HttpResponse.json({ content: [], totalElements: 0 })
      }),
    )

    await provisionalApi.GET('/api/problems', {
      params: { query: { difficulty: ['EASY', 'HARD'] } },
    })

    expect(captured).toContain('difficulty=EASY')
    expect(captured).toContain('difficulty=HARD')
    expect(captured).not.toContain('EASY%2CHARD')
  })
})

describe('MSW 인증 핸들러', () => {
  it('세션 쿠키가 비어 있으면 /api/me가 401이다', async () => {
    // 쿠키 항아리를 비우는 공개 API가 없다(명세 3.8). 헤더로 보낸 쿠키가
    // 항아리보다 우선하므로(getRequestCookies.mjs의 병합 순서), 빈 값을
    // 명시해 다른 테스트의 로그인에 영향받지 않게 한다.
    const { response } = await provisionalApi.GET('/api/me', {
      headers: { cookie: `${SESSION_COOKIE}=` },
    })

    expect(response.status).toBe(401)
  })

  it('자격 증명이 틀리면 401이고 세션을 심지 않는다', async () => {
    const { response } = await provisionalApi.POST('/api/auth/login', {
      body: { email: 'user@codari.test', password: '틀린비밀번호1!' },
    })

    expect(response.status).toBe(401)

    const me = await provisionalApi.GET('/api/me', {
      headers: { cookie: `${SESSION_COOKIE}=` },
    })
    expect(me.response.status).toBe(401)
  })

  it('로그인하면 쿠키로 세션이 유지되고 로그아웃하면 끊긴다', async () => {
    const login = await provisionalApi.POST('/api/auth/login', {
      body: { email: 'user@codari.test', password: 'Codari!test1' },
    })
    expect(login.data).toEqual({ id: 1, nickname: '코다리', role: 'USER' })

    // 쿠키를 직접 넘기지 않는다. MSW 항아리가 돌려주는 것을 확인하는 것이 요점이다.
    const me = await provisionalApi.GET('/api/me')
    expect(me.data).toEqual({ id: 1, nickname: '코다리', role: 'USER' })

    const logout = await provisionalApi.POST('/api/auth/logout')
    expect(logout.response.status).toBe(204)

    const after = await provisionalApi.GET('/api/me')
    expect(after.response.status).toBe(401)
  })

  it('ADMIN 계정은 role이 ADMIN이다', async () => {
    const login = await provisionalApi.POST('/api/auth/login', {
      body: { email: 'admin@codari.test', password: 'Codari!admin1' },
    })

    expect(login.data?.role).toBe('ADMIN')

    await provisionalApi.POST('/api/auth/logout')
  })
})
