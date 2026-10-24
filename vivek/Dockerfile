# VIVEK as a plain container: runs on Hugging Face Spaces (Docker SDK), Fly, Render or any VM.
# Same code as modal_app.py; models are downloaded at build time, never on a cold start.
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
ENV HF_HOME=/models
COPY models.json /root/models.json
RUN python -c "import json; from transformers import pipeline; c=json.load(open('/root/models.json')); [pipeline(c[k]['task'], model=c[k]['id']) for k in ('audio','face') if c[k]['id']]"
COPY app.py ai_client.py scoring.py masker.py audio.py ./
EXPOSE 7860
CMD ["uvicorn", "app:create_app", "--factory", "--host", "0.0.0.0", "--port", "7860", "--no-access-log"]
