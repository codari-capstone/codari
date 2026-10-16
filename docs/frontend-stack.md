# 프론트엔드 기술 스택·개발환경

Oct 3, 2026 · @찬우

프론트엔드는 React + Vite + TypeScript로 만든 SPA(단일 페이지 앱)이며, 빌드한 정적 파일을 Nginx로 배포하고 Spring Boot API와 HTTP(JSON)로 통신한다.

## 1. 기술 스택 한눈에

버전은 프로젝트 생성 시점의 최신 안정판을 설치하고, package.json과 lock 파일로 고정해 팀원과 CI가 같은 버전을 쓰게 한다.

| 영역             | 선택                                       | 이 프로젝트에서 하는 일                                       |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------- |
| 언어             | TypeScript                                 | 모든 코드에 타입을 붙여 API 응답·화면 데이터 실수를 미리 막음 |
| UI 라이브러리    | React 19                                   | 화면을 컴포넌트 단위로 만듦                                   |
| 빌드 도구        | Vite                                       | 개발 서버 실행, 배포용 정적 파일 빌드                         |
| 라우팅           | React Router                               | 주소(/problems/3 등)와 화면 연결, 로그인·관리자 권한 검사     |
| 서버 데이터 관리 | TanStack Query                             | API 호출, 캐시, 채점 진행률 폴링, 재시도                      |
| API 타입         | openapi-typescript + openapi-fetch         | 백엔드 OpenAPI 명세에서 TS 타입과 호출 함수를 자동 생성       |
| 코드 에디터      | CodeMirror 6                               | Python·C++ 문법 강조, 줄 번호, 줄 하이라이트                  |
| 지문 렌더링      | react-markdown + KaTeX                     | 마크다운 지문과 수식 표시                                     |
| 스타일           | Tailwind CSS + shadcn/ui                   | 화면 스타일, 버튼·탭·표·대화상자 부품                         |
| 폼               | React Hook Form + Zod                      | 관리자 문제 등록 폼 입력·검사                                 |
| 차트             | Recharts                                   | 학습 리포트 개념별 차트 (선택 기능)                           |
| 목 API           | MSW                                        | 백엔드가 준비되기 전 가짜 API로 화면 개발                     |
| 테스트           | Vitest + React Testing Library, Playwright | 단위·컴포넌트 테스트, 브라우저 E2E 테스트                     |
| 코드 품질        | ESLint + Prettier                          | 문법 오류 검사, 코드 모양 통일                                |
| 배포             | Nginx (Docker) + GitHub Actions            | 정적 파일 제공, PR 검사와 자동 배포                           |

## 2. 프레임워크 선정 이유

계획서의 Next.js 대신 React + Vite를 쓴다. 이 서비스는 서버 렌더링(SSR)이 필요한 화면이 거의 없고, 백엔드는 Spring Boot가 따로 맡기 때문이다.

### React + Vite를 고른 이유

1. **화면 대부분이 브라우저에서 동작하는 화면이다.** 코드 에디터, 채점 진행률 폴링, 힌트 패널, 관리자 탭은 모두 사용자 조작에 반응하는 기능이다. Next.js를 써도 이 화면들은 결국 클라이언트 컴포넌트로 만들게 된다.
2. **검색 노출(SEO)이 필요 없다.** 1순위 문제 출처인 KOI 기출은 CC BY-NC-SA 라이선스라 ‘비상업·로그인 제한 운영’이다. 지문을 검색엔진에 노출하지 않으므로 SSR의 가장 큰 장점이 사라진다.
3. **백엔드를 중복해서 만들 필요가 없다.** Next.js의 API 라우트·서버 액션은 Spring Boot가 이미 하는 일이다. 프론트엔드는 화면과 API 호출에만 집중한다.
4. **학습 부담이 작고 10주 일정에 안전하다.** 담당자는 JS 기초에서 React와 TypeScript를 함께 배운다. Next.js를 더하면 서버/클라이언트 컴포넌트 구분, 파일 기반 라우팅, 캐시 규칙까지 익혀야 하고, 오류 원인을 찾기도 어렵다.
5. **배포가 단순하고 예산이 줄어든다.** 빌드 결과가 정적 파일이라 Node.js 서버가 필요 없다. 계획서의 web EC2(t3.small)를 줄이거나 다른 서버에 합칠 수 있다.
6. **개발 속도가 빠르다.** Vite 개발 서버는 코드를 고치면 화면에 거의 즉시 반영된다(HMR).

### 포기한 것과 보완

- 첫 화면 로딩이 SSR보다 조금 느릴 수 있다 → 화면별 코드 분할(lazy loading)과 로딩 스켈레톤으로 보완
- 새로고침 시 404 문제 → Nginx에서 모든 경로를 index.html로 돌려주도록 설정(6장)
- 계획서와 달라짐 → 팀원·지도교수에게 위 2번과 5번을 근거로 공유

### TypeScript를 쓰는 이유

이 서비스는 판정 종류 9가지, AI 응답의 evidenceType(FACT/INFERENCE), 힌트 단계(1\~3)처럼 정해진 값이 많다. TypeScript로 이 값들을 타입으로 정해 두면, 오타나 빠뜨린 판정 처리를 실행 전에 에디터가 알려 준다. 또 백엔드 OpenAPI 명세에서 타입을 자동 생성하면, 백엔드가 응답 필드를 바꿨을 때 프론트엔드에서 고쳐야 할 곳이 컴파일 오류로 바로 드러난다. 처음에는 strict 모드를 켜되, 모르는 타입은 에디터의 추론에 맡기며 점진적으로 익힌다.

## 3. 라이브러리별 선정 이유

기준은 기능명세서의 필수 기능을 바로 해결하는지, 입문자가 자료를 찾기 쉬운지, 한 명이 10주 안에 관리할 수 있는지 세 가지다.

| 선택                                        | 비교한 대안                          | 선택 이유                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| React Router                                | TanStack Router                      | React에서 가장 널리 쓰여 한국어 자료가 많다. 로그인·관리자 권한 검사(COM-05)를 감싸는 레이아웃 라우트로 간단히 만든다                                                          |
| TanStack Query                              | useEffect + fetch 직접 작성, SWR     | 채점 진행률을 refetchInterval 옵션 하나로 폴링하고, 채점이 끝나면 멈출 수 있다(RES-01). 로딩·에러·캐시·재시도를 직접 만들지 않아도 된다                                        |
| openapi-typescript + openapi-fetch          | axios + 타입 수기 작성               | 계획서의 ‘OpenAPI 명세에서 TS 타입 자동 생성’을 그대로 구현한다. 백엔드와 데이터 구조가 어긋나면 컴파일 단계에서 잡힌다                                                        |
| CodeMirror 6                                | Monaco Editor                        | 코어가 약 150KB로 가볍고 모바일 터치를 지원한다(SOLVE-10). Monaco는 번들이 크고 모바일 지원이 약하다. 계획서의 선택을 유지                                                     |
| react-markdown + remark-math + rehype-katex | 직접 HTML 변환, MathJax              | 지문(마크다운·수식)을 안전하게 렌더링한다. HTML을 직접 넣지 않아 XSS 위험이 적고, KaTeX는 MathJax보다 빠르다                                                                   |
| Tailwind CSS + shadcn/ui                    | CSS Modules, MUI                     | 표·탭·대화상자·배지가 많은 화면(관리자, AI 패널)을 빨리 만든다. shadcn/ui는 부품 코드를 프로젝트에 복사해 쓰므로 자유롭게 고칠 수 있다. MUI는 디자인이 틀에 묶이고 번들이 크다 |
| React Hook Form + Zod                       | 직접 useState로 폼 관리              | 관리자 폼은 입력 항목이 많다(ADM-02\~05). Zod로 ‘태그 1\~3개’ 같은 규칙을 한 곳에 적고, 그 규칙에서 TS 타입도 얻는다                                                           |
| Recharts                                    | Chart.js                             | React 컴포넌트 방식으로 차트를 그린다. 선택 기능(REP-06)이라 필요할 때 추가                                                                                                    |
| MSW                                         | 백엔드 완성 대기, JSON 파일 하드코딩 | 1주차에 확정한 API 명세로 가짜 응답을 만들어 백엔드와 동시에 개발한다. 모든 판정 종류와 AI 장애 같은 예외 화면도 미리 확인할 수 있다                                           |
| Vitest + Testing Library, Playwright        | Jest, Cypress                        | Vitest는 Vite 설정을 그대로 쓰고, 계획서의 테스트 구성과 같다. Playwright로 ‘제출 → 판정 → AI 분석 → 힌트’ 시연 흐름을 자동 검사한다                                           |
| ESLint + Prettier                           | Biome                                | 자료가 가장 많고 Vite 템플릿에 ESLint가 기본 포함된다                                                                                                                          |
| 전역 상태 라이브러리 없음                   | Redux, Zustand                       | 서버 데이터는 TanStack Query가 맡고, 나머지는 로그인 정보 정도라 React Context로 충분하다. 필요해지면 Zustand를 추가                                                           |

## 4. 기술 설명

각 기술이 무엇인지와 이 프로젝트의 어느 기능에 쓰이는지를 정리했다.

### React

화면을 ‘컴포넌트’라는 부품으로 나눠 만드는 UI 라이브러리다. 컴포넌트는 데이터(상태)를 받아 화면을 그리는 함수이며, 상태가 바뀌면 React가 바뀐 부분만 다시 그린다. 예를 들어 힌트 패널은 ‘열린 단계 수’라는 상태를 가지고, 버튼을 누르면 그 값만 바꾸면 다음 힌트가 보인다. JS 기초에서 가장 먼저 익힐 것은 JSX(HTML처럼 생긴 문법), props(부모가 넘겨주는 값), useState(상태), useEffect(화면 밖과의 연동)다.

### Vite

개발 서버와 빌드를 맡는 도구다. 개발 중에는 `npm run dev`로 로컬 서버를 띄우고, 파일을 저장하면 새로고침 없이 화면에 반영된다. 배포할 때는 `npm run build`로 TypeScript와 JSX를 브라우저가 읽는 JS·CSS로 바꾸고 압축해 dist 폴더에 내놓는다. 개발 서버의 프록시 기능으로 `/api` 요청을 로컬 Spring Boot로 넘겨 CORS 없이 개발한다.

### TypeScript

JavaScript에 타입을 더한 언어다. `verdict: Verdict`처럼 변수에 들어갈 값의 종류를 적어 두면, 없는 판정 이름을 쓰거나 필드명을 틀렸을 때 실행 전에 오류가 표시된다. 브라우저는 TS를 직접 실행하지 못하므로 Vite가 JS로 바꾼다.

### React Router

주소와 화면을 연결한다. `/problems`는 문제 목록, `/problems/:id`는 문제 풀이, `/submissions/:id`는 제출 결과, `/me/report`는 학습 리포트, `/admin/*`은 관리자 화면이다. 로그인이 필요한 화면은 권한을 검사하는 레이아웃으로 감싼다.

### TanStack Query

서버에서 받아오는 데이터를 관리하는 라이브러리다. 데이터를 요청하면 로딩·성공·실패 상태를 알아서 관리하고, 같은 데이터는 캐시에서 바로 보여 준다. 이 프로젝트의 핵심 쓰임은 채점 폴링이다. 제출 상태가 ‘채점 중’이면 1초마다 다시 물어보고, 최종 판정이 나오면 자동으로 멈춘다. AI 분석·제출 같은 요청은 useMutation으로 보내고, 성공하면 관련 목록을 새로 불러온다.

### openapi-typescript + openapi-fetch

백엔드가 만든 OpenAPI 명세(API 설명서) 파일을 읽어 TS 타입 파일을 자동으로 만든다. openapi-fetch는 이 타입을 쓰는 작은 fetch 래퍼라서, `client.GET("/api/problems/{id}")`처럼 호출하면 경로·파라미터·응답 타입이 모두 자동으로 맞춰진다. 명세가 바뀌면 `npm run gen:api` 한 번으로 다시 만든다.

### CodeMirror 6

브라우저용 코드 에디터다. Python·C++ 언어 패키지로 문법 강조를 하고, 줄 번호·자동 들여쓰기·괄호 짝 맞추기를 제공한다. AI 분석의 줄 번호를 하이라이트하는 기능(AI-07)도 확장 기능으로 만들 수 있다. React에서는 @uiw/react-codemirror 래퍼로 쉽게 붙인다.

### react-markdown + KaTeX

관리자가 마크다운으로 쓴 지문을 화면에 표시한다. `$n \le 100$`처럼 쓴 수식은 KaTeX가 수학 기호로 그린다. 같은 컴포넌트를 관리자 지문 미리보기(ADM-03)에도 쓴다.

### Tailwind CSS + shadcn/ui

Tailwind는 `p-4 text-sm bg-red-50`처럼 미리 정해진 클래스를 조합해 스타일을 입히는 CSS 프레임워크다. 클래스 이름이 CSS 속성과 거의 같아 CSS 기초가 있으면 금방 익숙해지고, 반응형은 `md:` 같은 접두사로 처리한다. shadcn/ui는 Tailwind로 만든 버튼·탭·표·대화상자 코드를 명령어로 프로젝트에 복사해 주는 도구다. 판정 배지, 힌트 탭, 관리자 탭을 이 부품으로 만든다.

### React Hook Form + Zod

React Hook Form은 입력칸이 많은 폼을 적은 코드로 관리한다. Zod는 ‘제목은 필수, 태그는 1\~3개, 시간 제한은 양수’ 같은 규칙을 스키마로 적어 두면 입력값을 검사하고 에러 문구를 보여 준다.

### MSW (Mock Service Worker)

브라우저의 네트워크 요청을 가로채 가짜 응답을 돌려주는 도구다. 백엔드 API가 아직 없어도 `/api/submissions/1` 요청에 ‘채점 중 40%’ → ‘틀렸습니다’ 순서로 응답하게 만들어 결과 화면을 먼저 개발한다. 테스트에서도 같은 가짜 응답을 재사용한다.

### Vitest·Testing Library·Playwright

Vitest는 함수·컴포넌트 단위 테스트 도구이고, Testing Library는 ‘사용자가 버튼을 누르면 2단계 힌트가 보인다’처럼 사용자 관점으로 컴포넌트를 검사한다. Playwright는 실제 브라우저를 띄워 문제 선택부터 재제출까지 흐름 전체를 자동으로 눌러 본다.

### ESLint + Prettier

ESLint는 쓰지 않는 변수, 잘못된 Hook 사용 같은 실수를 찾고, Prettier는 저장할 때 코드 모양(들여쓰기·따옴표)을 통일한다.

### Nginx

정적 파일을 빠르게 내려주는 웹 서버다. dist 폴더를 Nginx 컨테이너에 넣어 배포하고, 없는 경로는 index.html을 돌려주도록 설정해 React Router가 화면을 고르게 한다.

## 5. 개발환경 구성

로컬에서는 Vite 개발 서버(5173번)를 띄우고, `/api` 요청은 Docker Compose로 실행한 Spring Boot(8080번)로 넘긴다. 백엔드가 준비되기 전에는 MSW 가짜 응답으로 개발한다.

### 설치할 도구

| 도구                           | 용도                                                      |
| ------------------------------ | --------------------------------------------------------- |
| Node.js LTS (24 이상) + npm    | Vite 실행, 패키지 설치                                    |
| Git                            | 버전 관리, GitHub 협업                                    |
| VS Code                        | 에디터. 확장: ESLint, Prettier, Tailwind CSS IntelliSense |
| Docker Desktop                 | 백엔드·DB·Judge0를 Docker Compose로 로컬 실행             |
| Chrome + React Developer Tools | 컴포넌트 상태·네트워크 디버깅                             |

### 프로젝트 생성

```bash
# 1. React + TypeScript 템플릿으로 생성
npm create vite@latest web -- --template react-ts
cd web
npm install

# 2. 라우팅·데이터·에디터·지문·폼
npm install react-router @tanstack/react-query openapi-fetch \
  @uiw/react-codemirror @codemirror/lang-python @codemirror/lang-cpp \
  react-markdown remark-math rehype-katex katex \
  react-hook-form zod @hookform/resolvers

# 3. 스타일 (Tailwind + shadcn/ui)
npm install tailwindcss @tailwindcss/vite
npx shadcn@latest init

# 4. 개발용 도구
npm install -D openapi-typescript msw prettier \
  vitest jsdom @testing-library/react @testing-library/jest-dom \
  @playwright/test
```

### 폴더 구조

화면(기능)별로 폴더를 나누어 기능명세서의 ID와 맞춘다.

```text
web/
├─ src/
│  ├─ app/            # 라우터, QueryClient, 레이아웃, 권한 검사 (COM)
│  ├─ api/            # schema.d.ts(자동 생성), client.ts, 쿼리 훅
│  ├─ features/
│  │  ├─ problems/    # 문제 목록 (LIST)
│  │  ├─ solve/       # 지문·에디터·예제 실행·제출 (SOLVE)
│  │  ├─ result/      # 채점 진행·판정·쉬운 설명 (RES)
│  │  ├─ ai/          # AI 분석·힌트·리뷰 (AI)
│  │  ├─ history/     # 제출 기록 (HIST)
│  │  ├─ report/      # 학습 리포트·추천 (REP)
│  │  └─ admin/       # 관리자 문제 제작 (ADM)
│  ├─ components/ui/  # shadcn/ui 부품
│  ├─ constants/      # 판정별 쉬운 설명(계획서 표 2·표 3)
│  ├─ mocks/          # MSW 가짜 응답
│  └─ main.tsx
├─ e2e/               # Playwright 테스트
├─ Dockerfile
├─ nginx.conf
└─ vite.config.ts
```

### API 프록시 설정

개발 중에도 화면과 API가 같은 주소(localhost:5173)로 보이게 해, 로그인 쿠키와 CORS 문제를 피한다. 운영의 ALB 경로 라우팅(`/api/*` → API 서버)과 같은 구조다.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
})
```

### npm 스크립트

| 명령                | 하는 일                                                 |
| ------------------- | ------------------------------------------------------- |
| `npm run dev`       | 개발 서버 실행                                          |
| `npm run dev:mock`  | MSW 가짜 응답으로 개발 서버 실행 (`vite --mode mock`)   |
| `npm run gen:api`   | 백엔드 OpenAPI 명세로 `src/api/schema.d.ts` 생성        |
| `npm run typecheck` | TypeScript 타입 검사                                    |
| `npm run lint`      | ESLint 검사                                             |
| `npm run format`    | Prettier로 코드 모양 통일 (CI는 `format:check`로 검사)  |
| `npm run test`      | Vitest 단위·컴포넌트 테스트                             |
| `npm run e2e`       | Playwright E2E 테스트                                   |
| `npm run build`     | 배포용 정적 파일을 dist에 생성                          |

### 환경 변수

Vite는 `VITE_`로 시작하는 변수만 화면 코드에 넣는다. 이 값은 브라우저에서 누구나 볼 수 있으므로 API 키 같은 비밀값은 절대 넣지 않는다. 비밀값은 백엔드와 SSM Parameter Store에만 둔다.

| 변수                    | 예시   | 설명                    |
| ----------------------- | ------ | ----------------------- |
| `VITE_POLL_INTERVAL_MS` | `1000` | 채점 진행률 폴링 간격   |

## 6. 배포와 CI

빌드한 dist 폴더를 Nginx 컨테이너 이미지로 만들고, ALB가 `/api/*`가 아닌 요청을 이 컨테이너로 보낸다. 화면과 API가 같은 도메인을 쓰므로 로그인 쿠키와 CORS 설정이 단순하다.

### Docker 이미지

```dockerfile
# 1단계: 빌드
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 2단계: Nginx로 제공
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
```

### Nginx 설정

`try_files`가 핵심이다. `/problems/3`처럼 실제 파일이 없는 주소도 index.html을 돌려주어, 새로고침해도 404가 나지 않고 React Router가 화면을 고른다.

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  # 파일명에 해시가 붙는 빌드 결과물은 오래 캐시
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}
```

### 배포 위치 선택지

| 선택지                                    | 장점                                | 단점                                        |
| ----------------------------------------- | ----------------------------------- | ------------------------------------------- |
| API EC2에 Nginx 컨테이너 함께 실행 (추천) | web EC2 1대 절감, ALB 구조는 그대로 | API 서버 자원을 조금 나눠 씀                |
| 계획서대로 web EC2 유지                   | 역할이 분리되어 명확                | Node 서버가 필요 없어 자원 낭비             |
| S3 + CloudFront                           | 서버 관리 없음, 빠름                | 구성이 늘고 쿠키·도메인 설정을 더 맞춰야 함 |

### GitHub Actions

PR을 올리면 아래 검사가 자동으로 돌고, 모두 통과해야 병합한다. main에 병합되면 이미지를 빌드해 ECR에 올리고 서버에 배포한다(배포 단계는 인프라 담당과 함께 구성).

1. `npm ci` — lock 파일 기준으로 설치
2. `npm run typecheck` — 타입 오류 검사
3. `npm run lint` — 코드 규칙 검사
4. `npm run test` — 단위·컴포넌트 테스트
5. `npm run build` — 빌드 성공 확인
6. `npm run e2e` — MSW 모드로 핵심 흐름 E2E (시간이 길면 main 병합 시에만)

## 7. 남은 결정 사항

- [x] 스타일링: Tailwind CSS + shadcn/ui로 확정 (2026-10-03)
- [ ] 프론트엔드 배포 위치를 인프라 담당과 결정 (6장 선택지)
- [x] 백엔드 OpenAPI 명세 파일 위치: `contracts/openapi.yaml`. CODEOWNERS가 세 명 공동 리뷰로 잡아 두었고 `npm run gen:api`가 이 경로를 읽는다
- [ ] 계획서 6.5·7.2절의 Next.js 기술을 React + Vite로 고칠지, 지도교수님께 변경 공유
