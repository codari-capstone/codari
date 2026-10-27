# syntax=docker/dockerfile:1
# 웹 이미지 (infra/compose.yaml). 빌드한 정적 파일을 nginx가 내보내고 /api/는 API 서버로 넘긴다.
# 빌드 결과(JS·CSS)는 아키텍처와 무관해서 빌드 단계는 빌드하는 기계(BUILDPLATFORM)에서 돈다.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
