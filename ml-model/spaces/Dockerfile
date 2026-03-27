FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy inference + API code
COPY inference/ ./inference/
COPY api/main.py ./api/main.py

# HF Spaces runs on port 7860
ENV PORT=7860

EXPOSE 7860

CMD ["python", "api/main.py"]
