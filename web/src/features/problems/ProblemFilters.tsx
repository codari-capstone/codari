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
  const { data: tags = [] } = useQuery(conceptTagsQuery())

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
        {tags.map((tag) => (
          <FilterCheckbox
            key={tag.slug}
            label={tag.name}
            checked={params.tag.includes(tag.slug)}
            onChange={() => apply({ tag: toggled(params.tag, tag.slug) })}
          />
        ))}
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
          {/* 기본값을 URL에 쓰지 않으므로 쿼리 없는 주소가 곧 초기화 상태다 */}
          <Link to="/problems">필터 초기화</Link>
        </Button>
      ) : null}
    </div>
  )
}
