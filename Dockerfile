# Use Node.js LTS version
FROM node:20-slim

# Install system dependencies required for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    libu2f-udev \
    libvulkan1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Install Playwright browsers explicitly
RUN npx playwright install chromium --with-deps

# Verify browsers are installed
RUN npx playwright --version && echo "✅ Playwright installed successfully"

# Copy application files
COPY . .

# Build TypeScript (if needed)
RUN npm run build || true

# Expose port
EXPOSE 3000

# Copy startup script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Set environment variables
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0

# Start the server using startup script
CMD ["/app/start.sh"]

