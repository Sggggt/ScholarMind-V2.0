FROM python:3.11-slim

ARG AIDER_CHAT_VERSION=0.86.2

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
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

COPY . .

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
