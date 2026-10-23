import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-e2e',
      'playwright-report',
      'test-results',
      // gen:api가 자동 생성하므로 검사하지 않는다
      'src/api/schema.d.ts',
      // msw init이 생성한다
      'public/mockServiceWorker.js',
    ],
  },

  // 화면 코드 (브라우저)
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // 쓰지 않는 변수는 오류. _ 로 시작하면 의도적으로 버린 값으로 본다.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // shadcn add로 받은 부품 (frontend-stack.md §4: 이 폴더에는 받은 부품만 둔다)
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      // 생성 코드가 컴포넌트와 cva variants를 함께 내보내서 이 규칙이 늘 걸린다
      // (button의 buttonVariants, tabs의 tabsListVariants — 둘 다 우리는 쓰지 않는다).
      // 고쳐도 다음 `shadcn add`에 되돌아오므로, 우리가 지킬 수 없는 경고를 띄우지 않는다.
      // 규칙의 대상은 우리가 직접 만든 컴포넌트다. 이 폴더 파일을 직접 고칠 일이 생기면
      // 그 파일의 HMR 문제도 함께 가려지는 것이 비용이다.
      'react-refresh/only-export-components': 'off',
    },
  },

  // Hook 규칙. react-hooks 7은 configs['recommended-latest']가 구형(eslintrc) 형식이고,
  // flat config는 configs.flat 아래에 들어 있다.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },

  // 설정 파일과 E2E (Node)
  {
    files: ['*.config.{ts,js}', 'e2e/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
    },
  },

  // Prettier와 겹치는 모양 규칙을 끈다. 반드시 마지막에 둔다.
  prettier,
)
