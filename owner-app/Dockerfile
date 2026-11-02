# 1단계: 앱 화면을 빌드한다
FROM node:24-slim AS web
WORKDIR /build
COPY package.json package-lock.json tsconfig.json vite.config.ts index.html ./
COPY contract ./contract
COPY src ./src
RUN npm ci
RUN npm run build

# 2단계: 서버가 API와 앱 화면을 함께 제공한다. 개발용 스크립트와 테스트는 넣지 않는다
FROM python:3.14-slim
ENV PYTHONUNBUFFERED=1 \
    KEEPER_ENV=production \
    KEEPER_DB_PATH=/data/keeper.db \
    KEEPER_STATIC_DIR=/app/static \
    FORWARDED_ALLOW_IPS=*
WORKDIR /app
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server/keeper ./keeper
COPY server/asgi.py .
COPY --from=web /build/dist ./static

RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin keeper && mkdir /data && chown keeper /data
USER keeper
VOLUME /data

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import os,urllib.request as u; u.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", 8000)}/health', timeout=4)"

# 호스팅 서비스가 정한 PORT를 쓰고, 앞단 프록시가 알려주는 실제 접속 IP를 읽는다
CMD ["sh", "-c", "exec uvicorn asgi:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
