# Self-hosted toxic-bert inference service (CPU only).
# The model files are downloaded once at BUILD time into /app/model and loaded
# from that folder at run time with Hugging Face offline mode on, so the running
# service never contacts Hugging Face: it depends only on the files on its disk.
FROM python:3.12-slim

WORKDIR /app
ENV PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1

# CPU-only PyTorch (the default Linux wheel bundles several GB of CUDA libraries).
RUN pip install torch==2.15.0 --index-url https://download.pytorch.org/whl/cpu
RUN pip install transformers==5.24.0 fastapi==0.165.0 uvicorn==0.54.0

# Pinned model revision; only the files the PyTorch pipeline needs (~440 MB).
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('unitary/toxic-bert', revision='4d6c22e74ba2fdd26bc4f7238f50766b045a0d94', local_dir='/app/model', allow_patterns=['config.json', 'model.safetensors', 'vocab.txt', 'tokenizer_config.json', 'special_tokens_map.json'])"

COPY app.py .

ENV MODEL_DIR=/app/model HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
# Few threads: the container's CPU share is far smaller than the host's core count.
ENV TORCH_THREADS=2 OMP_NUM_THREADS=2 MKL_NUM_THREADS=2
# "::" listens on IPv4 and IPv6 (Railway's private network uses IPv6).
CMD ["sh", "-c", "uvicorn app:app --host :: --port ${PORT:-8000}"]
