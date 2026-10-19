FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS node-build
WORKDIR /app
ENV ONNXRUNTIME_NODE_INSTALL=skip
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/coverage-python
COPY ml-training/requirements-history-semantic.txt /tmp/coverage-requirements.txt
RUN /opt/coverage-python/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/coverage-python/bin/pip install --no-cache-dir --no-deps torch==2.11.0+cpu --index-url https://download.pytorch.org/whl/cpu \
    && /opt/coverage-python/bin/pip install --no-cache-dir -r /tmp/coverage-requirements.txt \
    && /opt/coverage-python/bin/pip check
WORKDIR /app
ENV NODE_ENV=production PORT=8004 \
    COVERAGE_BUNDLE_DIR=/app/coverage-runtime \
    COVERAGE_PYTHON=/opt/coverage-python/bin/python \
    PYTHONDONTWRITEBYTECODE=1 PYTHONUTF8=1 PYTHONIOENCODING=utf-8 \
    HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 \
    OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
COPY --from=node-build /app/node_modules ./node_modules
COPY --from=node-build /app/dist ./dist
COPY package.json ./
COPY public/english-coverage ./public/english-coverage
COPY public/expert-annotation ./public/expert-annotation
COPY runtime/coverage ./coverage-runtime
COPY packaging/coverage-verification.json ./packaging/coverage-verification.json
COPY packaging/ict-verification.json ./packaging/ict-verification.json
RUN mkdir -p uploads generated_audio .cache && chown node:node uploads generated_audio .cache \
    && /opt/coverage-python/bin/python -B -c "import sys;sys.path.insert(0,'coverage-runtime/ml-training');from coverage_runtime_bundle import load_bundle;load_bundle('coverage-runtime')"
USER node
LABEL org.opencontainers.image.title="Smart Handwritten Notes" \
      org.opencontainers.image.description="Notes API with packaged Science and History models, private R2 images and Knowledge Base v2 retrieval" \
      org.opencontainers.image.source="https://github.com/Interactive-Digital-Learning-Platform/Smart-HandWritten-Note-Understanding-Service"
EXPOSE 8004
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8004)+'/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
