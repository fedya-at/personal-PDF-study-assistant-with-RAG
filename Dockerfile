# Multi-stage build: build React frontend, then run FastAPI backend

# Stage 1: Build React frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci
COPY ui/ .
RUN npm run build

# Stage 2: Run FastAPI backend with static frontend
FROM python:3.11-slim

# Install system dependencies (for chromadb, models, etc.)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY app.py chunker.py embedder.py pdf_loader.py rag_pipeline.py vector_store.py vector_storechromadb.py ./

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/ui/dist ./static

# Create directory for persistent vector store
RUN mkdir -p /app/chroma_data

# Expose port
EXPOSE 8000

# Run with gunicorn + uvicorn workers for production
CMD ["gunicorn", "-w", "1", "-b", "0.0.0.0:8000", "-k", "uvicorn.workers.UvicornWorker", "--timeout", "120", "app:app"]
