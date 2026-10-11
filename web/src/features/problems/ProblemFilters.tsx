import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { useMemo } from 'react'

import { DIFFICULTIES, SOLVE_STATUSES } from '@/api/provisional'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'
import { DIFFICULTY_LABEL, SOLVE_STATUS_LABEL } from './labels'
import {
  hasActiveFilter,
  parseParams,
  serializeParams,
  type ProblemListParams,
} from './problemListParams'
import { conceptTagsQuery } from './problemsQuery'

/**
 * 체크박스 하나. 네이티브 input을 쓰는 이유는 Radix 래퍼 없이도 역할·상태·키보드
 * 조작이 전부 따라오기 때문이다. 꾸미기만 Tailwind로 한다.
 */
function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    // 44px 터치 영역(2.5.5)을 라벨 전체로 확보한다
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-primary size-4"
      />
      {label}
    </label>
  )
}

/** 이미 고른 값이면 빼고, 아니면 더한다. */
function toggled<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide">{title}</h2>
      {children}
    </div>
  )
}

/**
 * 사이드바 필터 (LIST-03).
 *
 * prop을 받지 않는다. 필터 상태가 URL에 있으므로 본문의 ProblemListPage와
 * 각자 useSearchParams로 읽는다. 둘 사이에 레이아웃 라우트가 끼어 있어
 * prop을 내리기 어려운데, URL을 상태 저장소로 쓴 덕에 문제가 되지 않는다.
 */
export function ProblemFilters() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = useMemo(() => parseParams(searchParams), [searchParams])
  const { isAuthenticated } = useAuth()
  const { data: tags = [], error: tagsError, refetch: refetchTags } = useQuery(conceptTagsQuery())

  function apply(next: Partial<ProblemListParams>) {
    setSearchParams(serializeParams({ ...params, ...next }))
  }

  return (
    <div className="flex flex-col gap-5">
      <FilterGroup title="난이도">
        {DIFFICULTIES.map((difficulty) => (
          <FilterCheckbox
            key={difficulty}
            label={DIFFICULTY_LABEL[difficulty]}
            checked={params.difficulty.includes(difficulty)}
            onChange={() => apply({ difficulty: toggled(params.difficulty, difficulty) })}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="개념 태그">
        {tagsError ? (
          /*
           * 사이드바 보조 필터라 ErrorState급 큰 블록은 과하다. 한 줄 안내와 다시
           * 시도 버튼으로 줄인다. 로딩 중 표시는 따로 두지 않는다 — 태그는 보통
           * 바로 도착해서, 깜빡였다 사라지는 로딩 줄이 그냥 늦게 나타나는 것보다
           * 더 거슬린다. 이게 없으면 URL에 ?tag=dp가 있어도 체크박스가 영영 안
           * 보여 사용자가 자신의 결과를 좁히는 필터를 확인·해제할 수 없다.
           */
          <div role="alert" className="flex min-h-11 items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">태그를 불러오지 못했습니다</span>
            <Button variant="outline" size="sm" onClick={() => void refetchTags()}>
              다시 시도
            </Button>
          </div>
        ) : (
          tags.map((tag) => (
            <FilterCheckbox
              key={tag.slug}
              label={tag.name}
              checked={params.tag.includes(tag.slug)}
              onChange={() => apply({ tag: toggled(params.tag, tag.slug) })}
            />
          ))
        )}
      </FilterGroup>

      {/*
        비로그인에게는 풀이 상태가 없는 데이터다. 표의 열과 이 섹션을 함께
        숨긴다. 한쪽만 숨기면 동작하지 않는 필터가 남는다 (COM-05).
      */}
      {isAuthenticated ? (
        <FilterGroup title="풀이 상태">
          {SOLVE_STATUSES.map((status) => (
            <FilterCheckbox
              key={status}
              label={SOLVE_STATUS_LABEL[status]}
              checked={params.status.includes(status)}
              onChange={() => apply({ status: toggled(params.status, status) })}
            />
          ))}
        </FilterGroup>
      ) : null}

      {hasActiveFilter(params) ? (
        <Button asChild variant="outline" size="lg" className="min-h-11">
          {/*
            기본값을 URL에 쓰지 않으므로 쿼리 없는 주소가 곧 초기화 상태다. 이 링크는
            일부러 깨끗한 '/problems'로 돌아간다 — 단순하고 공유하기 쉽다는 이유로
            sort까지 함께 버린다. hasActiveFilter가 sort를 필터로 안 치는 건(결과를
            줄이지 않으니까) 초기화 버튼을 보여줄지 정하는 기준일 뿐, 눌렀을 때 sort를
            지킨다는 뜻은 아니다.
          */}
          <Link to="/problems">필터 초기화</Link>
        </Button>
      ) : null}
    </div>
  )
}
