import { useEffect, useState } from 'react'

/** 좌우 분할로 그릴 최소 폭. Tailwind의 `lg`(64rem = 1024px)와 같은 값이다. */
const WIDE = '(min-width: 64rem)'

/**
 * 지문과 에디터를 나란히 둘 만큼 넓은지 (SOLVE-10).
 *
 * CSS만으로는 안 된다. Radix의 Tabs는 비활성 패널에 `hidden`을 걸고, Tailwind preflight가
 * `[hidden] { display: none !important }`를 넣어서 `lg:block` 같은 클래스로 되살릴 수 없다.
 * `forceMount` + `!important`로 이길 수는 있지만 레이어 순서에 기대는 방식이라 조용히
 * 깨지고, jsdom에는 CSS가 없어 단위 테스트가 그걸 잡지 못한다.
 *
 * 분할용·탭용 마크업을 따로 두고 CSS로 하나만 띄우는 방법도 쓰지 않는다. 지문과 에디터가
 * DOM에 두 벌이 되어 복사 버튼도 둘이 되고, 2차에서 CodeMirror가 두 번 켜진다.
 *
 * 폭을 넘나들면 패널이 다시 마운트된다. 작성 중인 코드는 이 컴포넌트 위(SolvePage)에
 * 두므로 그래도 살아 있다.
 */
export function useWideLayout(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches)

  useEffect(() => {
    const query = window.matchMedia(WIDE)
    const update = () => setWide(query.matches)
    // 첫 렌더와 이 effect 사이에 폭이 바뀐 경우를 맞춘다.
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return wide
}
