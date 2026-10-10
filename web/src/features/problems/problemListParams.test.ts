import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PARAMS,
  hasActiveFilter,
  nextSort,
  parseParams,
  serializeParams,
  toQuery,
  type ProblemListParams,
} from './problemListParams'

function parse(search: string) {
  return parseParams(new URLSearchParams(search))
}

describe('parseParams', () => {
  it('빈 URL은 기본값이다', () => {
    expect(parse('')).toEqual(DEFAULT_PARAMS)
  })

  it('keyword의 앞뒤 공백을 정리한다', () => {
    expect(parse('keyword=%20%20두+수%20%20').keyword).toBe('두 수')
  })

  it('난이도를 여러 개 읽는다', () => {
    expect(parse('difficulty=EASY&difficulty=HARD').difficulty).toEqual(['EASY', 'HARD'])
  })

  // URL은 사용자가 손으로 고칠 수 있다. 모르는 값이 쿼리로 나가면 서버가 400을 준다.
  it('모르는 난이도 값은 버린다', () => {
    expect(parse('difficulty=BANANA&difficulty=EASY').difficulty).toEqual(['EASY'])
  })

  it('모르는 풀이 상태 값은 버린다', () => {
    expect(parse('status=MAYBE&status=WRONG').status).toEqual(['WRONG'])
  })

  it('빈 태그 값은 버린다', () => {
    expect(parse('tag=&tag=array').tag).toEqual(['array'])
  })

  it('허용된 sort를 읽는다', () => {
    expect(parse('sort=difficulty,desc')).toMatchObject({
      sortField: 'difficulty',
      sortDirection: 'desc',
    })
  })

  it('모르는 sort 필드는 기본값으로 되돌린다', () => {
    expect(parse('sort=title,asc')).toMatchObject({ sortField: 'id', sortDirection: 'asc' })
  })

  it('모르는 sort 방향은 기본값으로 되돌린다', () => {
    expect(parse('sort=id,sideways')).toMatchObject({ sortField: 'id', sortDirection: 'asc' })
  })

  it('방향이 없는 sort는 기본값으로 되돌린다', () => {
    expect(parse('sort=difficulty')).toMatchObject({ sortField: 'id', sortDirection: 'asc' })
  })
})

describe('serializeParams', () => {
  // 기본값을 URL에 쓰면 '/problems'와 초기화 상태가 달라져, EmptyState의
  // '필터 초기화' 링크(to="/problems")가 같은 화면으로 돌아오지 않는다.
  it('기본값은 URL에 쓰지 않는다', () => {
    expect(serializeParams(DEFAULT_PARAMS).toString()).toBe('')
  })

  it('고른 값만 쓴다', () => {
    const search = serializeParams({
      ...DEFAULT_PARAMS,
      keyword: '두 수',
      difficulty: ['EASY'],
      sortField: 'difficulty',
      sortDirection: 'desc',
    })

    expect(search.get('keyword')).toBe('두 수')
    expect(search.getAll('difficulty')).toEqual(['EASY'])
    expect(search.get('sort')).toBe('difficulty,desc')
  })

  it('parse와 serialize가 왕복한다', () => {
    // 배열 속성에 as const를 쓰면 읽기 전용 튜플이 되어 serializeParams가 요구하는
    // 가변 배열 타입과 맞지 않는다. 타입을 명시해 문맥적으로 추론하게 한다.
    const params: ProblemListParams = {
      ...DEFAULT_PARAMS,
      keyword: '괄호',
      difficulty: ['EASY', 'HARD'],
      tag: ['array', 'dp'],
      status: ['WRONG'],
      sortField: 'difficulty',
      sortDirection: 'desc',
    }

    expect(parseParams(serializeParams(params))).toEqual(params)
  })
})

describe('toQuery', () => {
  it('빈 값은 쿼리에 넣지 않는다', () => {
    expect(toQuery(DEFAULT_PARAMS)).toEqual({ sort: 'id,asc' })
  })

  it('고른 값만 넣는다', () => {
    expect(toQuery({ ...DEFAULT_PARAMS, keyword: '합', difficulty: ['EASY'] })).toEqual({
      sort: 'id,asc',
      keyword: '합',
      difficulty: ['EASY'],
    })
  })
})

describe('hasActiveFilter', () => {
  it('정렬만 바꾼 건 필터가 아니다', () => {
    expect(hasActiveFilter({ ...DEFAULT_PARAMS, sortField: 'difficulty' })).toBe(false)
  })

  it('검색어도 필터로 센다', () => {
    expect(hasActiveFilter({ ...DEFAULT_PARAMS, keyword: '합' })).toBe(true)
  })

  it('태그를 고르면 필터다', () => {
    expect(hasActiveFilter({ ...DEFAULT_PARAMS, tag: ['dp'] })).toBe(true)
  })
})

describe('nextSort', () => {
  it('같은 열을 누르면 방향을 뒤집는다', () => {
    expect(nextSort({ ...DEFAULT_PARAMS, sortField: 'id', sortDirection: 'asc' }, 'id')).toEqual({
      sortField: 'id',
      sortDirection: 'desc',
    })
  })

  // 번호를 내림차순으로 보던 중 난이도를 누르면 '어려움부터'가 되어 놀란다.
  it('다른 열을 누르면 그 열의 asc로 시작한다', () => {
    expect(
      nextSort({ ...DEFAULT_PARAMS, sortField: 'id', sortDirection: 'desc' }, 'difficulty'),
    ).toEqual({ sortField: 'difficulty', sortDirection: 'asc' })
  })
})
