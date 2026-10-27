import type { ReactNode } from 'react'

/**
 * 라벨·설명·오류를 한 벌로 감싼다 (ADM-02·03).
 *
 * 로그인·가입 폼이 칸마다 쓰는 세 줄(`label` + 입력칸 + `p.text-destructive`)과 같은
 * 모양이다. 거기서는 칸이 둘뿐이라 펼쳐 썼지만 이 폼은 열 칸이 넘어 한 곳에 모았다.
 * 네이티브 `label`을 쓰는 것도 같은 이유다 — `@/components/ui`에 label이 없고,
 * `htmlFor`만으로 입력칸과 이어진다.
 */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  /** 칸 아래가 아니라 위에 둔다. 입력하기 전에 읽어야 하는 말이다. */
  hint?: ReactNode
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {hint === undefined ? null : <p className="text-muted-foreground text-xs">{hint}</p>}
      {children}
      {error === undefined ? null : <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
