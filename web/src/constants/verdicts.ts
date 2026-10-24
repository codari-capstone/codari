import type { RuntimeErrorType, SubmissionStatus, Verdict } from '@/api/types'

export interface VerdictInfo {
  /** 백준 표기를 따른 한글 이름 (RES-02). */
  label: string
  /** 무슨 일이 일어났는지 (RES-03). */
  description: string
  /** 무엇부터 봐야 하는지 (RES-03). */
  checkFirst: string
}

/**
 * 판정별 이름과 쉬운 설명 (RES-02·03).
 *
 * 문구는 `docs/AI_FEATURES.md` 10절 표에서 가져왔다. AI 없이 보여 주는 것이라 서버를
 * 거치지 않고 여기 둔다(`constants/README.md`).
 *
 * **런타임 에러만 문서와 다르다.** 문서는 이름이 "런타임 에러 (종류)"이고 설명이 "…멈췄어요.
 * 괄호 안이 멈춘 이유예요."인데, 화면은 종류를 괄호가 아니라 아래 따로 둔 상자에 보여 준다
 * (`RUNTIME_ERROR_INFO`). 괄호가 없는 화면에 "괄호 안"이라고 적으면 가리킬 것이 없다.
 *
 * 백준 표기를 따르는 이유는 입문자가 다른 곳에서 본 이름과 같아야 검색이 되기 때문이다.
 *
 * `JUDGE_ERROR`는 판정이 아니라 상태다(계약: `verdict`가 null이고 시도 횟수에 넣지
 * 않는다). 문서에서는 한 표에 있고 화면에서도 같은 자리에 나오므로 여기 함께 둔다 —
 * 표를 둘로 가르면 같은 모양의 표가 두 벌이 되어 한쪽만 고쳐지는 날이 온다.
 */
export const VERDICT_INFO: Record<Verdict | 'JUDGE_ERROR', VerdictInfo> = {
  ACCEPTED: {
    label: '맞았습니다!!',
    description: '모든 테스트에서 정답과 똑같이 출력했어요.',
    checkFirst: '[AI 리뷰]로 더 빠르거나 읽기 쉬운 방법이 있는지 확인해 보세요.',
  },
  PRESENTATION_ERROR: {
    label: '출력 형식이 잘못되었습니다',
    description: '답의 내용은 맞았지만 띄어쓰기나 줄바꿈이 문제에서 요구한 모양과 달라요.',
    checkFirst:
      '줄 끝에 남은 공백, 빠지거나 더해진 빈 줄, 숫자 사이 구분 문자를 예제 출력과 한 글자씩 비교해 보세요.',
  },
  WRONG_ANSWER: {
    label: '틀렸습니다',
    description: '프로그램은 끝까지 실행됐지만, 어떤 입력에서 정답과 다른 값을 출력했어요.',
    checkFirst:
      '가장 작은 입력과 가장 큰 입력, 빠뜨린 조건, 값이 자료형 범위를 넘는지 확인해 보세요.',
  },
  TIME_LIMIT_EXCEEDED: {
    label: '시간 초과',
    description:
      '정해진 시간 안에 프로그램이 끝나지 않았어요. 답이 맞는지는 아직 확인하지 못했어요.',
    checkFirst:
      '입력이 가장 클 때 반복이 몇 번 도는지 계산하고, 끝나지 않는 반복이 없는지 확인해 보세요.',
  },
  MEMORY_LIMIT_EXCEEDED: {
    label: '메모리 초과',
    description: '허용된 메모리보다 많이 사용했어요.',
    checkFirst: '배열·리스트의 크기와 재귀 호출의 깊이를 확인해 보세요.',
  },
  OUTPUT_LIMIT_EXCEEDED: {
    label: '출력 초과',
    description: '정답보다 훨씬 많은 양을 출력했어요.',
    checkFirst: '출력하는 반복문이 제때 끝나는지, 디버깅용 출력이 남아 있지 않은지 확인해 보세요.',
  },
  RUNTIME_ERROR: {
    label: '런타임 에러',
    description: '실행 도중 프로그램이 멈췄어요.',
    checkFirst: '아래 종류별 설명을 확인해 보세요.',
  },
  COMPILE_ERROR: {
    label: '컴파일 에러',
    description:
      '실행하기 전 문법 검사에서 막혔어요. 결과를 누르면 몇 번째 줄에서 무엇이 문제인지 알려 주는 메시지를 볼 수 있어요.',
    checkFirst:
      '괄호·세미콜론·들여쓰기, 선언하지 않은 변수, 제출 언어를 제대로 골랐는지 확인해 보세요.',
  },
  JUDGE_ERROR: {
    label: '채점 불가',
    description: '서버 문제로 채점하지 못했어요. 내 코드의 문제가 아니에요.',
    checkFirst: '잠시 후 다시 제출해 주세요. 이 제출은 시도 횟수에 넣지 않아요.',
  },
}

/**
 * 런타임 에러 종류별 이름과 설명 (RES-04).
 *
 * 이름은 `docs/judge-verdict-mapping.md` 4절의 "화면 표시", 설명은 `AI_FEATURES.md` 10절의
 * "런타임 에러 종류별 설명"이다. 이름에 Python과 C++ 양쪽을 함께 적는 이유는 같은 원인이
 * 두 언어에서 다른 이름으로 나오기 때문이다(IndexError와 Segfault가 같은 칸이다).
 */
export const RUNTIME_ERROR_INFO: Record<RuntimeErrorType, { label: string; description: string }> =
  {
    INDEX_ERROR: {
      label: 'IndexError / Segfault',
      description:
        '리스트·배열에 없는 칸을 읽거나 썼어요(C++의 Segfault는 잘못된 메모리 접근 전반). 반복 범위와 배열 크기를 비교해 보세요.',
    },
    ZERO_DIVISION: {
      label: 'ZeroDivisionError / DivisionByZero',
      description: '0으로 나눴어요. 나누는 값이 0이 되는 입력이 있는지 확인해 보세요.',
    },
    VALUE_ERROR: {
      label: 'ValueError',
      description:
        '값의 모양이 맞지 않아 변환하지 못했어요. 한 줄에 숫자가 여러 개인데 int(input())으로 읽지 않았는지 확인해 보세요.',
    },
    NAME_ERROR: {
      label: 'NameError',
      description: '만들지 않은 변수나 함수 이름을 썼어요. 오타와 대소문자를 확인해 보세요.',
    },
    TYPE_ERROR: {
      label: 'TypeError',
      description: '서로 다른 종류의 값끼리 계산했어요(예: 문자열 + 숫자).',
    },
    RECURSION_ERROR: {
      label: 'RecursionError / StackOverflow',
      description:
        '재귀 호출이 너무 깊어요. 종료 조건이 있는지, 깊이가 입력 크기만큼 커지지 않는지 확인해 보세요.',
    },
    EOF_ERROR: {
      label: 'EOFError',
      description: '주어진 입력보다 더 많이 읽으려 했어요. 입력 줄 수를 다시 확인해 보세요.',
    },
    OTHER: {
      label: '런타임 에러 (기타)',
      description:
        '위 종류에 들지 않는 이유로 멈췄어요. 예외 메시지가 없거나 비정상 종료한 경우예요.',
    },
  }

/**
 * 채점이 끝나기 전 상태 문구 (RES-01).
 *
 * 채점이 끝난 뒤에는 `Headline`이 `VERDICT_INFO`의 이름을 띄우므로 `COMPLETED`와
 * `JUDGE_ERROR`는 쓰일 일이 없다. 그래도 타입을 전부 채우는 이유는 서버가 계약을 어겨
 * 판정 없이 COMPLETED를 줘도 빈 자리를 두지 않기 위해서다.
 *
 * `JUDGE_ERROR`는 글자를 다시 적지 않고 `VERDICT_INFO`에서 가져온다 — 같은 이름을 두
 * 곳에 적으면 한쪽만 고쳐져도 타입 검사는 통과한다.
 */
export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  QUEUED: '기다리는 중',
  COMPILING: '채점 준비 중',
  RUNNING: '채점 중',
  COMPLETED: '채점 완료',
  JUDGE_ERROR: VERDICT_INFO.JUDGE_ERROR.label,
}
