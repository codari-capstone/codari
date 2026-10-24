import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { clearSavedCode } from '@/features/solve/savedCode'
import { logoutRequest } from './authQuery'

/**
 * 로그아웃 (COM-03).
 *
 * 캐시를 전체(clear) 비운다. ['me']만 지우면 문제 목록의 풀이 상태, 제출 기록,
 * 학습 리포트가 이전 사용자 것으로 화면에 남는다. 로그아웃은 "이 사람의 데이터를
 * 전부 잊는다"는 뜻이다.
 *
 * 브라우저에 저장한 풀이 코드(SOLVE-11)도 함께 지운다. 캐시만 비우면 공용 컴퓨터에서
 * 로그아웃한 사람의 코드가 디스크에 남는다. 테마 설정은 지우지 않는다 — 그쪽은 사람이
 * 아니라 이 기기의 보기 설정이다.
 *
 * 서버 요청이 실패해도 같은 일을 한다(onSuccess가 아니라 onSettled). 실패에서
 * 멈추면 로그아웃 버튼이 먹지 않는 것처럼 보인다.
 *
 * 그래도 **로그아웃을 꾸며 내지는 않는다.** 요청이 실패하고 서버 세션이 살아 있으면,
 * 도착한 화면의 useAuth가 /api/me를 다시 물어 로그인 상태를 그대로 받는다. 헤더가 다시
 * 사용자 메뉴로 돌아오는 건 그래서다. ['me']에 null을 심어 로그아웃된 것처럼 보이게 할
 * 수도 있지만, 그러면 공용 컴퓨터에서 "로그아웃됐다"고 본 사람의 세션이 실제로는 살아
 * 있게 된다. 사실과 다른 쪽이 위험하므로 화면이 사실을 따른다. 다시 누르면 다시 보낸다.
 */
export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      queryClient.clear()
      clearSavedCode()
      void navigate('/problems', { replace: true })
    },
  })

  return { logout: () => mutation.mutate(), isPending: mutation.isPending }
}
