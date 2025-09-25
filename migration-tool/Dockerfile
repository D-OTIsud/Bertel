# syntax=docker/dockerfile:1.7

FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install system deps for building python packages
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency metadata first for better caching
COPY pyproject.toml README.md ./
COPY migration_tool ./migration_tool

RUN pip install --upgrade pip \
    && pip install .

EXPOSE 8090

CMD ["uvicorn", "migration_tool.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8090"]
