import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { adminProblemVersionsQuery } from './adminProblemQuery'
import { VERSION_STATUS_LABEL } from './labels'

/** 날짜만 보여 준다. 분 단위까지 필요한 화면이 아니다. */
function day(iso: string | null): string {
  if (iso === null) return '—'
  return iso.slice(0, 10)
}

/**
 * 버전 관리 탭 (ADM-07).
 *
 * **모든 수정이 버전을 만들지 않는다.** 지문·태그 같은 글은 최신 버전을 그 자리에서
 * 고치고, 채점 기준(시간·메모리 제한, 케이스, 언어)이 바뀔 때만 새 초안이 생긴다(#33).
 * 그래서 여기 줄 수는 "고친 횟수"가 아니라 "채점 기준이 바뀐 횟수"다 — 그 말을 화면에도
 * 적어 둔다. 적지 않으면 관리자는 지문을 고친 뒤 버전이 안 늘어난 것을 버그로 읽는다.
 */
export function VersionsTab({ problemId }: { problemId: number }) {
  const { data, isPending, error, refetch } = useQuery(adminProblemVersionsQuery(problemId))

  if (error) return <ErrorState problem={error} onRetry={() => void refetch()} />
  if (isPending) return <ListSkeleton rows={3} />

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        채점 기준(시간·메모리 제한, 테스트케이스, 언어)이 바뀔 때만 새 버전이 생겨요. 지문과 태그를
        고치면 최신 버전에 바로 반영돼요.
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">버전</TableHead>
            <TableHead className="w-28">상태</TableHead>
            <TableHead className="w-32">만든 날</TableHead>
            <TableHead className="w-32">공개한 날</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((version) => (
            <TableRow key={version.versionNo}>
              <TableCell className="font-medium">
                {/*
                  링크는 fieldset의 disabled에 걸리지 않는다. 버전을 읽기 전용으로 보는
                  화면도 이 탭을 쓰므로, 거기서도 다른 버전으로 옮겨 갈 수 있다.
                */}
                <Link
                  to={`/admin/problems/${problemId}/versions/${version.versionNo}`}
                  className="hover:text-primary hover:underline"
                >
                  {`v${version.versionNo}`}
                </Link>
              </TableCell>
              <TableCell>{VERSION_STATUS_LABEL[version.status]}</TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {day(version.createdAt)}
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {day(version.publishedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
