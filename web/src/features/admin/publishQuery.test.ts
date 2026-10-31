import { afterEach, describe, expect, it } from 'vitest'

import { api } from '@/api/client'
import type { ProblemVersionStatus } from '@/api/types'
import { problemCode } from '@/features/auth/problemCode'
import { resetAdminProblems } from '@/mocks/handlers'
import { publishProblem, unmetFromError, unpublishProblem } from './adminProblemQuery'

// 공개·비공개는 목의 버전 상태를 고친다. 되돌리지 않으면 한 테스트가 공개한 버전을
// 다음 테스트가 초안으로 알고 단언한다.
afterEach(() => resetAdminProblems())

/**
 * 목 상태를 **API로만** 본다. 목 내부 배열을 들여다보면 계약에 없는 모양에 기대게 되고,
 * 화면이 실제로 받는 것과 갈라진다.
 */
async function detailOf(id: number) {
  const result = await api.GET('/api/admin/problems/{id}', { params: { path: { id } } })
  if (result.data === undefined) throw new Error(`${String(id)}번 상세를 못 받았다`)
  return result.data
}

async function versionsOf(id: number): Promise<Record<number, ProblemVersionStatus>> {
  const result = await api.GET('/api/admin/problems/{id}/versions', { params: { path: { id } } })
  return Object.fromEntries((result.data ?? []).map((item) => [item.versionNo, item.status]))
}

/** 9번은 공개된 v1 위에 초안 v2가 있고, 못 채운 조건이 출처 하나뿐인 fixture다. */
const WITH_DRAFT = 9
/** 10번은 조건을 넷이나 못 채운 초안이다. */
const UNREADY = 10
/** 11번은 검증 중이고 조건도 못 채웠다 — 둘 중 어느 쪽으로 막히는지 가린다. */
const VALIDATING = 11
/** 1번은 조건을 다 채운 채 공개 중이다. */
const PUBLISHED = 1

/** 출처를 채워 9번 초안의 마지막 조건을 없앤다. 계약: 조건은 저장으로만 바뀐다. */
async function fillSource(id: number): Promise<void> {
  const detail = await detailOf(id)
  const result = await api.PUT('/api/admin/problems/{id}', {
    params: { path: { id } },
    body: { ...detail, sourceName: '백준 1000번' },
  })
  // 저장이 조용히 거절되면 그 뒤 단언이 엉뚱한 곳을 가리킨다.
  if (result.data === undefined) {
    throw new Error(`출처 저장 실패: ${String(result.response.status)}`)
  }
}

describe('공개·비공개 (ADM-06)', () => {
  it('조건을 다 채운 초안을 공개하면 전에 공개하던 버전은 지난 버전이 된다', async () => {
    await fillSource(WITH_DRAFT)
    expect((await detailOf(WITH_DRAFT)).unmetConditions).toEqual([])

    await publishProblem(WITH_DRAFT)

    expect(await versionsOf(WITH_DRAFT)).toEqual({ 1: 'RETIRED', 2: 'PUBLISHED' })
    expect((await detailOf(WITH_DRAFT)).publishedVersionNo).toBe(2)
  })

  it('조건을 못 채우면 거절하고 못 채운 조건을 준다', async () => {
    const before = await detailOf(UNREADY)
    expect(before.unmetConditions.length).toBeGreaterThan(0)

    const error = await publishProblem(UNREADY).catch((reason: unknown) => reason)

    expect(problemCode(error)).toBe('PUBLISH_CONDITIONS_NOT_MET')
    // 화면이 이 값으로 조건 목록을 다시 그린다. 상세가 아는 것과 같아야 한다.
    expect(unmetFromError(error)).toEqual(before.unmetConditions)
    expect((await detailOf(UNREADY)).status).toBe('DRAFT')
  })

  /**
   * 계약의 순서: 검증 중이면 **공개 조건을 보기 전에** 409 `PROBLEM_VALIDATING`이다.
   * 11번은 조건도 못 채웠으므로, 조건을 먼저 보는 구현이면 다른 코드가 나온다.
   */
  it('검증 중이면 조건을 보기 전에 막는다', async () => {
    expect((await detailOf(VALIDATING)).unmetConditions.length).toBeGreaterThan(0)

    const error = await publishProblem(VALIDATING).catch((reason: unknown) => reason)

    expect(problemCode(error)).toBe('PROBLEM_VALIDATING')
  })

  it('이미 공개 중이면 아무것도 바꾸지 않는다', async () => {
    const before = await versionsOf(PUBLISHED)

    await expect(publishProblem(PUBLISHED)).resolves.toBeUndefined()

    expect(await versionsOf(PUBLISHED)).toEqual(before)
  })

  it('비공개로 내리면 공개 중인 버전이 없어진다', async () => {
    await unpublishProblem(PUBLISHED)

    const detail = await detailOf(PUBLISHED)
    expect(detail.publishedVersionNo).toBeNull()
    expect(detail.status).toBe('RETIRED')
  })

  /** 계약: "초안이 있으면 초안은 그대로 둔다." 내려도 고치던 초안은 잃지 않는다. */
  it('비공개는 초안을 건드리지 않는다', async () => {
    await unpublishProblem(WITH_DRAFT)

    expect(await versionsOf(WITH_DRAFT)).toEqual({ 1: 'RETIRED', 2: 'DRAFT' })
  })

  /** 계약: 공개 중인 버전이 없어도 204다. 화면이 이걸 오류로 다루면 안 된다. */
  it('공개 중인 버전이 없어도 비공개는 성공한다', async () => {
    expect((await detailOf(UNREADY)).publishedVersionNo).toBeNull()

    await expect(unpublishProblem(UNREADY)).resolves.toBeUndefined()
  })
})
