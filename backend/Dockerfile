FROM python:3.11-slim

WORKDIR /app

# Install GDAL system dependencies
RUN apt-get update && apt-get install -y \
    gdal-bin libgdal-dev python3-gdal \
    libpq-dev gcc g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create data directories
RUN mkdir -p /app/data/processed /app/data/demo_images /app/data/raw

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
