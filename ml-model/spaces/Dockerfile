FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY inference/__init__.py ./inference/__init__.py
COPY inference/predictor.py ./inference/predictor.py
COPY api/main.py ./api/main.py

# HF Spaces requires port 7860
ENV PORT=7860

EXPOSE 7860

CMD ["python", "api/main.py"]
