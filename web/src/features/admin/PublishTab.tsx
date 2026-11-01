import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { PublishCondition } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { problemMessage } from '@/features/auth/problemCode'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import {
  adminProblemQuery,
  publishProblem,
  unmetFromError,
  unpublishProblem,
} from './adminProblemQuery'
import { PUBLISH_CONDITION_LABEL } from './labels'

/**
 * 공개 조건과 공개·비공개 (ADM-06).
 *
 * **조건은 서버가 센다.** 화면은 상세의 `unmetConditions`를 받아 적을 뿐이다 — 케이스
 * 수와 검증 상태를 화면에서 다시 세면, 서버가 세는 값과 두 곳이 되고 공개 버튼의 활성과
 * 실제 거절이 갈라진다.
 *
 * 상세는 폼 페이지가 이미 받아 뒀다. 같은 키로 한 번 더 물으므로 요청이 더 나가지 않고,
 * 공개 뒤 무효화도 이 탭에서 끝낼 수 있다.
 */
export function PublishTab({
  problemId,
  locked,
  onGoToTab,
}: {
  problemId: number
  /**
   * 검증 중. **공개만** 막는다 — 서버가 조건보다 먼저 409 `PROBLEM_VALIDATING`을 준다.
   * 비공개는 계약에 409가 없어 막지 않는다(비공개 버튼의 주석).
   */
  locked: boolean
  /** 못 채운 조건을 고칠 탭으로 보낸다. 탭 상태는 폼 페이지가 들고 있다. */
  onGoToTab: (tab: string) => void
}) {
  const queryClient = useQueryClient()
  const detail = useQuery(adminProblemQuery(problemId))
  const [notice, setNotice] = useState<string | null>(null)

  /**
   * 공개를 거절당한 순간 서버가 알려 준 조건.
   *
   * 조건은 내 화면 밖에서 바뀔 수 있다 — 보는 사이 다른 관리자가 케이스를 지웠거나,
   * 저장으로 검증 기록이 지워졌을 수 있다. 받아 둔 상세가 '다 채웠다'고 해도 거절이 온다.
   *
   * 지우는 효과를 두지 않는다. 받은 **시각**을 함께 들고 있다가 새 상세가 오면 저절로
   * 쓰이지 않게 한다 — 언제 지울지를 따로 정하지 않아도 된다.
   */
  const [rejected, setRejected] = useState<{ at: number; conditions: PublishCondition[] } | null>(
    null,
  )

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-problem', problemId] })
    await queryClient.invalidateQueries({ queryKey: ['admin-problems'] })
    // 공개·비공개는 **사용자 화면을 바꾸는 동작이다.** 사용자용 캐시를 그대로 두면
    // staleTime(30초) 안에는 내린 문제가 목록과 풀기 화면에 그대로 있고, 새로 공개한
    // 문제는 목록에 없다 — 관리자가 자기 화면에서 확인할 때 가장 먼저 겪는다
    // (저장 흐름이 #33 때문에 이미 같은 일을 한다: AdminProblemFormPage).
    await queryClient.invalidateQueries({ queryKey: ['problem', problemId] })
    await queryClient.invalidateQueries({ queryKey: ['problems'] })
  }

  const publish = useMutation({
    mutationFn: () => publishProblem(problemId),
    onMutate: () => {
      setNotice(null)
      // 지난 비공개 오류를 지운다. 뮤테이션의 오류는 자기 자신을 다시 실행할 때만
      // 지워져, 두면 이번 결과 옆에 옛 실패 문구가 남는다.
      unpublish.reset()
    },
    onSuccess: async () => {
      setNotice(`v${String(detail.data?.versionNo ?? '')}을 공개했어요. 사용자 화면에 보여요`)
      await refresh()
    },
    onError: (error) => {
      forgetSessionIfUnauthorized(queryClient, error)
      // 거절 본문이 **지금의** 조건이다. 여기서 상세를 다시 받지 않는다 — 같은 사실을
      // 한 번 더 묻는 왕복이고, 돌아온 응답이 이 목록을 바로 덮어 거절 이유가 사라진다.
      const unmet = unmetFromError(error)
      if (unmet !== undefined) setRejected({ at: detail.dataUpdatedAt, conditions: unmet })
    },
  })

  const unpublish = useMutation({
    mutationFn: () => unpublishProblem(problemId),
    onMutate: () => {
      setNotice(null)
      publish.reset()
    },
    onSuccess: async () => {
      setNotice('비공개로 내렸어요. 사용자 화면에서는 보이지 않아요')
      await refresh()
    },
    onError: (error) => {
      forgetSessionIfUnauthorized(queryClient, error)
    },
  })

  if (detail.isPending) return <ListSkeleton rows={4} />
  if (detail.data === undefined) {
    return <ErrorState problem={detail.error} onRetry={() => void detail.refetch()} />
  }

  // 거절 당시의 목록은 새 상세가 오면 쓰이지 않는다(`rejected` 주석).
  const unmet =
    rejected !== null && rejected.at === detail.dataUpdatedAt
      ? rejected.conditions
      : detail.data.unmetConditions
  const isPublished = detail.data.status === 'PUBLISHED'
  const busy = publish.isPending || unpublish.isPending
  const error = publish.error ?? unpublish.error

  return (
    <div className="flex flex-col gap-4 py-4">
      <div>
        <h2 className="text-lg font-semibold">공개 조건</h2>
        <p className="text-muted-foreground text-sm">
          {/*
            '아직 공개한 적이 없어요'라고 적지 않는다. 내린 뒤에도 `publishedVersionNo`는
            null이라 그 문구가 거짓이 된다 — 상세만으로는 공개한 적이 있는지 알 수 없다
            (지난 버전 목록을 받아야 안다). 지금 사실만 적는다.
          */}
          {isPublished
            ? `v${String(detail.data.versionNo)}이 공개 중이에요. 사용자에게 보여요`
            : detail.data.publishedVersionNo === null
              ? '공개 중인 버전이 없어요. 사용자에게 보이지 않아요'
              : `사용자는 v${String(detail.data.publishedVersionNo)}를 풀고 있어요`}
        </p>
      </div>

      {unmet.length === 0 ? (
        <p className="text-sm">공개 조건을 모두 채웠어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {unmet.map((condition) => {
            /*
              모르는 값이 올 수 있다. 서버가 새 조건을 먼저 배포하면 화면에 없는 코드가
              온다 — 그걸 그대로 찾아 쓰면 undefined에서 터지고, 라우트 오류 경계가 폼
              화면을 통째로 덮어 거절 이유도 못 보게 된다. 코드라도 보여 주고 버튼은
              잠긴 채로 둔다(이 줄이 목록에 남으므로 `unmet.length > 0`이다).
            */
            const info: (typeof PUBLISH_CONDITION_LABEL)[PublishCondition] | undefined =
              PUBLISH_CONDITION_LABEL[condition]
            return (
              <li key={condition} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-destructive">
                  {info?.text ?? `아직 못 채운 조건이 있어요 (${condition})`}
                </span>
                {/* 조건만 보여 주고 고칠 곳을 알려 주지 않으면 네 탭을 뒤져야 한다. */}
                {info === undefined ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => onGoToTab(info.tab)}
                  >
                    {`${info.tabLabel} 탭으로`}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {problemMessage(error)}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {/*
          이미 공개 중인 버전에는 [공개하기]를 두지 않는다. 계약이 그 경우를 "아무것도
          바꾸지 않고 204"로 정했으니, 두면 아무 일도 없는 응답을 받고 '공개했어요'라고
          알리게 된다.
        */}
        {isPublished ? null : (
          <Button
            type="button"
            className="min-h-11"
            disabled={unmet.length > 0 || locked || busy}
            onClick={() => publish.mutate()}
          >
            공개하기
          </Button>
        )}

        {/*
          [공개하기]에는 확인창을 두지 않는다. 조건을 다 채워야 눌리고 [비공개]로 바로
          되돌릴 수 있다 — 되돌릴 수 있는 동작까지 묻기 시작하면 확인을 읽지 않게 된다.
          비공개는 사용자 화면에서 문제가 사라지고 상세·제출이 404가 되므로 묻는다.
        */}
        {detail.data.publishedVersionNo === null ? null : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              {/*
                검증 중에도 내릴 수 있다. 계약의 `unpublishProblem`에는 409가 없고 서버도
                검증 상태를 보지 않는다 — 공개 중인 v1에서 오답이 발견됐는데 초안 v2가
                검증 중이라고 막으면, 검증이 끝날 때까지 틀린 문제가 사용자에게 계속
                보인다. 내려도 초안은 그대로 남아 검증은 하던 대로 끝난다(계약).
              */}
              <Button type="button" variant="outline" className="min-h-11" disabled={busy}>
                비공개로 내리기
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>비공개로 내릴까요?</AlertDialogTitle>
                <AlertDialogDescription>
                  사용자 목록에서 사라지고, 풀던 사람에게는 문제가 없다고 나와요. 이미 한 제출
                  기록은 지워지지 않고, 고치던 초안도 그대로 남아요.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>그대로 두기</AlertDialogCancel>
                <AlertDialogAction onClick={() => unpublish.mutate()}>
                  비공개로 내리기
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  )
}
