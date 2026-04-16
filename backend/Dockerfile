FROM python:3.11-slim

ARG AIDER_CHAT_VERSION=0.86.2
ARG AIDEML_VERSION=0.2.2
ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ARG PIP_TRUSTED_HOST=pypi.tuna.tsinghua.edu.cn

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_CACHE_DIR=/root/.cache/pip \
    PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_TRUSTED_HOST=${PIP_TRUSTED_HOST} \
    AIDE_VENV=/opt/.venv-aide-py311 \
    AIDE_PYTHON=/opt/.venv-aide-py311/bin/python \
    AIDER_VENV=/opt/.venv-aider-py311 \
    AIDER_PYTHON=/opt/.venv-aider-py311/bin/python

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        openssh-client \
        texlive-latex-base \
        texlive-latex-recommended \
        texlive-fonts-recommended \
        texlive-pictures \
        texlive-bibtex-extra \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

RUN python -m venv "$AIDER_VENV" \
    && "$AIDER_VENV/bin/pip" install --upgrade pip \
    && "$AIDER_VENV/bin/pip" install "aider-chat==$AIDER_CHAT_VERSION"

RUN python -m venv "$AIDE_VENV" \
    && "$AIDE_VENV/bin/pip" install --upgrade pip \
    && "$AIDE_VENV/bin/pip" install "aideml==$AIDEML_VERSION"

COPY . .

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
