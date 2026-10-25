/**
 * 학생 코드가 만든 원문 (RES-04·05, SOLVE-08).
 *
 * **글자 그대로 그린다.** 계약이 `runtimeErrorMessage`·`compilerMessage`·예제별
 * `errorMessage`에 "학생 코드가 만든 문자열이라 글자 그대로 보여 준다(HTML로 렌더링하지
 * 않는다)"고 적어 뒀다. 지문과 정반대다 — 여기에 Markdown을 물리면 학생이 쓴 `*`이나
 * `<`가 해석되어 원문이 달라지고, 무엇이 틀렸는지 알아볼 수 없게 된다.
 *
 * 제출 결과(RES)와 예제 실행(SOLVE-08)이 같이 쓴다. 결과 화면에 있던 것을 옮겼다 —
 * 그 자리에 두고 가져다 쓰면 문자열 하나 때문에 풀이 화면 청크가 결과 화면 모듈
 * 전체를 끌고 온다.
 */
export function Raw({ text }: { text: string }) {
  return (
    <pre className="bg-muted mt-2 overflow-x-auto rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap">
      {text}
    </pre>
  )
}
