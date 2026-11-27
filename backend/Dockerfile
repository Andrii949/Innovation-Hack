FROM python:3.12-slim-bookworm

ARG TARGETARCH
ARG TYPST_VERSION=0.15.1

COPY --from=ghcr.io/astral-sh/uv:0.13.9 /uv /uvx /bin/

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        fonts-dejavu-core \
        poppler-utils \
        xz-utils \
    && case "${TARGETARCH:-amd64}" in \
        amd64) typst_arch="x86_64" ;; \
        arm64) typst_arch="aarch64" ;; \
        *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${typst_arch}-unknown-linux-musl.tar.xz" -o /tmp/typst.tar.xz \
    && tar -xJf /tmp/typst.tar.xz -C /tmp \
    && install -m 0755 "/tmp/typst-${typst_arch}-unknown-linux-musl/typst" /usr/local/bin/typst \
    && rm -rf /tmp/typst* \
    && rm -rf /var/lib/apt/lists/* \
    && typst --version \
    && pdftoppm -v

WORKDIR /workspace/backend

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/workspace/backend/.venv/bin:$PATH"

COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-install-project

COPY alembic.ini ./
COPY alembic ./alembic
RUN mkdir -p alembic/versions
COPY app ./app
COPY scripts ./scripts
RUN uv sync --locked --no-dev --no-editable \
    && mkdir -p /workspace/backend/app/print/fonts \
    && cp -n /usr/share/fonts/truetype/dejavu/*.ttf /workspace/backend/app/print/fonts/

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh \
    && groupadd --gid 1000 appuser \
    && useradd --uid 1000 --gid 1000 --create-home appuser \
    && mkdir -p /workspace/files \
    && chown -R appuser:appuser /workspace

USER appuser

EXPOSE 8000

ENTRYPOINT ["/workspace/backend/docker-entrypoint.sh"]
CMD ["api"]
