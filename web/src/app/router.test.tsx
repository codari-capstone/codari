import { isValidElement } from 'react'
import { describe, expect, it } from 'vitest'

import { router } from './router'

/** 라우트 트리를 (경로, 조상 Component 이름들) 쌍으로 펼친다. */
function flatten(
  routes: typeof router.routes,
  ancestors: string[] = [],
): { path: string; ancestors: string[] }[] {
  return routes.flatMap((route) => {
    // createBrowserRouter가 Component를 element로 바꿔 저장한다. 이름은 element.type에서 읽는다.
    const name =
      isValidElement(route.element) && typeof route.element.type === 'function'
        ? route.element.type.name
        : ''
    const own = name ? [...ancestors, name] : ancestors
    const self = route.path ? [{ path: route.path, ancestors: own }] : []
    const children = route.children ? flatten(route.children, own) : []
    return [...self, ...children]
  })
}

const tree = flatten(router.routes)

function guardsOf(path: string): string[] {
  const found = tree.find((entry) => entry.path === path)
  // 없는 경로를 조용히 넘기지 않도록 던진다. 반환 타입도 undefined 없이 좁혀진다.
  if (!found) throw new Error(`${path} 라우트가 없다`)
  return found.ancestors
}

describe('라우터 보호 구조', () => {
  it.each(['submissions', 'submissions/:id', 'me/report'])(
    '%s는 RequireAuth 아래에 있다',
    (path) => {
      expect(guardsOf(path)).toContain('RequireAuth')
    },
  )

  it('admin/*는 RequireAuth와 RequireAdmin 둘 다 아래에 있다', () => {
    expect(guardsOf('admin/*')).toContain('RequireAuth')
    expect(guardsOf('admin/*')).toContain('RequireAdmin')
  })

  it.each(['problems', 'problems/:id', 'login', 'forbidden', '*'])(
    '%s는 보호하지 않는다',
    (path) => {
      expect(guardsOf(path)).not.toContain('RequireAuth')
    },
  )

  it('보호된 화면도 AppShell을 쓰는 레이아웃 아래에 있다', () => {
    // 형제로 두면 헤더가 사라진다. RootLayout이 조상에 있어야 한다.
    expect(guardsOf('submissions')).toContain('RootLayout')
    expect(guardsOf('admin/*')).toContain('RootLayout')
  })
})
