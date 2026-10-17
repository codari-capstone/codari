# web

프론트엔드. React 19 + Vite + TypeScript SPA이며, 빌드한 정적 파일을 Nginx로 배포하고
Spring Boot API와 HTTP(JSON)로 통신한다. 자세한 선정 근거는 [docs/frontend-stack.md](../docs/frontend-stack.md)에 있다.

## 시작하기

Node.js 24 이상이 필요하다.

```bash
npm install
cp .env.example .env   # 필요한 값을 채운다
npm run dev            # http://localhost:5173
```

백엔드가 아직 없으면 MSW 가짜 응답으로 개발한다.

```bash
npm run dev:mock
```

## 명령

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | 개발 서버. `/api` 요청은 localhost:8080으로 넘어간다 |
| `npm run dev:mock` | MSW 가짜 응답으로 개발 서버 실행 |
| `npm run gen:api` | `contracts/openapi.yaml`에서 `src/api/schema.d.ts` 생성 |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | ESLint 검사 |
| `npm run format` | Prettier로 코드 모양 통일 |
| `npm run test` | Vitest 단위·컴포넌트 테스트 |
| `npm run e2e` | Playwright E2E (`npx playwright install chromium` 필요) |
| `npm run build` | 배포용 정적 파일을 `dist/`에 생성 |

## 폴더

| 폴더 | 내용 |
| --- | --- |
| `src/app/` | 라우터, QueryClient, 레이아웃, 권한 검사 (COM) |
| `src/api/` | `schema.d.ts`(자동 생성), `client.ts`, 쿼리 훅 |
| `src/features/` | 화면별 기능. 기능명세서 ID와 폴더가 1:1로 맞는다 |
| `src/components/` | 직접 만든 화면 조각. 받을지 만들지의 기준은 [docs/frontend-stack.md](../docs/frontend-stack.md)의 '부품을 받을지, 직접 만들지' |
| `src/components/ui/` | `shadcn add`로 받은 부품 |
| `src/constants/` | 판정별 쉬운 설명 (RES-03·RES-04) |
| `src/mocks/` | MSW 가짜 응답 |
| `e2e/` | Playwright 테스트 |

## 알아 둘 것

- `npm run gen:api`는 `contracts/openapi.yaml`이 있어야 동작한다. 1주차 M1에서 명세를 확정한다.
- `shadcn add <부품>` 뒤에는 `npm run format`을 돌린다. 생성 코드가 쌍따옴표를 쓴다.
- `VITE_` 접두사가 붙은 환경 변수는 브라우저에서 누구나 볼 수 있다. 비밀값은 넣지 않는다.
