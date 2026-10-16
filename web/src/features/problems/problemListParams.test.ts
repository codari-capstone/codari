import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PARAMS,
  hasActiveFilter,
  nextSort,
  parseParams,
  serializeParams,
  PAGE_SIZE,
  pageCount,
  pageItems,
  toQuery,
  withChanges,
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
    // sort·page·size는 늘 보낸다. size를 빼면 서버가 전체를 주고(계약) 페이지 나누기가
    // 사라지므로 "빈 값"에 해당하지 않는다.
    expect(toQuery(DEFAULT_PARAMS)).toEqual({ sort: 'id,asc', page: 0, size: PAGE_SIZE })
  })

  it('고른 값만 넣는다', () => {
    expect(toQuery({ ...DEFAULT_PARAMS, keyword: '합', difficulty: ['EASY'] })).toEqual({
      sort: 'id,asc',
      page: 0,
      size: PAGE_SIZE,
      keyword: '합',
      difficulty: ['EASY'],
    })
  })

  // 주소와 화면은 1부터, 계약은 0부터 센다. 이 한 줄을 잘못 쓰면 2페이지를 눌렀는데
  // 1페이지가 다시 오거나(빼기를 잊음) 첫 로드에서 2페이지가 온다.
  it('page는 0부터로 바꿔 보낸다', () => {
    expect(toQuery({ ...DEFAULT_PARAMS, page: 3 })).toMatchObject({ page: 2, size: PAGE_SIZE })
  })
})

describe('page 읽기', () => {
  it('주소의 page를 읽는다', () => {
    expect(parse('page=3').page).toBe(3)
  })

  // 주소는 사용자가 손으로 고친다. 0이나 음수를 그대로 쓰면 toQuery가 음수 page를
  // 보내고 서버가 400을 준다(#109: page는 0 이상).
  it.each(['page=0', 'page=-2', 'page=1.5', 'page=abc', 'page='])(
    '모르는 page는 1로 본다: %s',
    (search) => {
      expect(parse(search).page).toBe(1)
    },
  )
})

describe('page 쓰기', () => {
  it('1페이지는 주소에 쓰지 않는다', () => {
    // 기본값을 쓰지 않는 규칙에 EmptyState의 '필터 초기화'(to="/problems")가 기댄다.
    expect(serializeParams(DEFAULT_PARAMS).toString()).toBe('')
  })

  it('2페이지부터 주소에 쓴다', () => {
    expect(serializeParams({ ...DEFAULT_PARAMS, page: 2 }).get('page')).toBe('2')
  })

  it('주소로 쓰고 다시 읽으면 같다', () => {
    const params: ProblemListParams = { ...DEFAULT_PARAMS, keyword: '합', page: 4 }
    expect(parseParams(serializeParams(params))).toEqual(params)
  })
})

describe('withChanges', () => {
  // 3페이지를 보다가 필터를 걸면 결과가 줄어 3페이지가 빈 표가 된다.
  it('필터를 바꾸면 1페이지로 돌아간다', () => {
    const from: ProblemListParams = { ...DEFAULT_PARAMS, page: 3 }
    expect(withChanges(from, { difficulty: ['HARD'] })).toMatchObject({
      page: 1,
      difficulty: ['HARD'],
    })
  })

  it('검색어를 바꿔도 1페이지로 돌아간다', () => {
    expect(withChanges({ ...DEFAULT_PARAMS, page: 3 }, { keyword: '합' }).page).toBe(1)
  })

  it('정렬을 바꿔도 1페이지로 돌아간다', () => {
    expect(withChanges({ ...DEFAULT_PARAMS, page: 3 }, { sortField: 'difficulty' }).page).toBe(1)
  })

  it('페이지만 바꾸면 그 페이지로 간다', () => {
    const from: ProblemListParams = { ...DEFAULT_PARAMS, keyword: '합', page: 2 }
    expect(withChanges(from, { page: 5 })).toEqual({ ...from, page: 5 })
  })
})

describe('pageCount', () => {
  it.each([
    [0, 1],
    [1, 1],
    [PAGE_SIZE, 1],
    [PAGE_SIZE + 1, 2],
    [PAGE_SIZE * 2, 2],
    [PAGE_SIZE * 2 + 1, 3],
  ])('%i개면 %i페이지', (total, expected) => {
    expect(pageCount(total)).toBe(expected)
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

  it('난이도를 고르면 필터다', () => {
    expect(hasActiveFilter({ ...DEFAULT_PARAMS, difficulty: ['EASY'] })).toBe(true)
  })

  it('풀이 상태를 고르면 필터다', () => {
    expect(hasActiveFilter({ ...DEFAULT_PARAMS, status: ['SOLVED'] })).toBe(true)
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

  it('같은 열을 다시 누르면 asc로 돌아온다', () => {
    expect(nextSort({ ...DEFAULT_PARAMS, sortField: 'id', sortDirection: 'desc' }, 'id')).toEqual({
      sortField: 'id',
      sortDirection: 'asc',
    })
  })
})

describe('pageItems', () => {
  it('페이지가 적으면 모두 보여 준다', () => {
    expect(pageItems(1, 3)).toEqual([1, 2, 3])
  })

  // 문제가 늘면 페이지도 늘어난다. 전부 그리면 좁은 화면에서 줄이 넘친다.
  it('멀리 떨어진 번호는 접는다', () => {
    expect(pageItems(10, 20)).toEqual([1, null, 9, 10, 11, null, 20])
  })

  it('양 끝은 늘 남긴다', () => {
    expect(pageItems(1, 20)).toEqual([1, 2, null, 20])
    expect(pageItems(20, 20)).toEqual([1, null, 19, 20])
  })

  // 끝에서 둘째라 1 하나만 끊긴다. 번호 하나를 '…'로 바꾸면 누를 것이 줄어든다.
  it('한 칸만 끊기면 접지 않는다', () => {
    expect(pageItems(2, 4)).toEqual([1, 2, 3, 4])
  })
})
