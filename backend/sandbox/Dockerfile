FROM python:3.11-slim

WORKDIR /experiment

# 基础科学计算依赖
RUN pip install --no-cache-dir \
    torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir \
    numpy pandas scikit-learn matplotlib seaborn \
    tqdm pyyaml jsonlines transformers datasets \
    accelerate evaluate rouge-score nltk

# 安全: 非root用户
RUN useradd -m researcher
USER researcher

CMD ["bash"]
