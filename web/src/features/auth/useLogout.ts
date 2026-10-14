import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { logoutRequest } from './authQuery'

/**
 * 로그아웃 (COM-03).
 *
 * 캐시를 전체(clear) 비운다. ['me']만 지우면 문제 목록의 풀이 상태, 제출 기록,
 * 학습 리포트가 이전 사용자 것으로 화면에 남는다. 로그아웃은 "이 사람의 데이터를
 * 전부 잊는다"는 뜻이다.
 *
 * 서버 요청이 실패해도 같은 일을 한다(onSuccess가 아니라 onSettled). 실패에서
 * 멈추면 로그아웃 버튼이 먹지 않는 것처럼 보인다. 서버 쪽 세션이 남을 수 있다는
 * 위험은 있지만, 그 때문에 화면이 로그아웃을 거부하지는 않는다.
 */
export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      queryClient.clear()
      void navigate('/problems', { replace: true })
    },
  })

  return { logout: () => mutation.mutate(), isPending: mutation.isPending }
}
