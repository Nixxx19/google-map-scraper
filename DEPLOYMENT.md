# Deployment Guide

This guide covers deploying the Google Maps Scraper to various platforms.

## Important: Playwright Browsers

Playwright requires Chromium browser to be installed. The `postinstall` script in `package.json` automatically installs browsers after `npm install`.

## Deployment Options

### 1. Docker Deployment

**Build and run:**
```bash
docker build -t google-maps-scraper .
docker run -p 3000:3000 google-maps-scraper
```

**Docker Compose:**
```yaml
version: '3.8'
services:
  scraper:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
```

### 2. Railway / Render / Fly.io

These platforms automatically detect and build from the Dockerfile.

**Railway:**
1. Connect your GitHub repository
2. Railway will auto-detect the Dockerfile
3. Deploy!

**Render:**
1. Create a new Web Service
2. Connect your repository
3. Build Command: `npm install && npm run build`
4. Start Command: `npm run ui`
5. Set Environment: `NODE_ENV=production`

### 3. Heroku

**Option A: Using Docker (Recommended)**
```bash
heroku container:push web
heroku container:release web
```

**Option B: Using Buildpacks**
1. Add buildpacks:
```bash
heroku buildpacks:add heroku/nodejs
heroku buildpacks:add jontewks/puppeteer
```

2. Add config vars:
```bash
heroku config:set NODE_ENV=production
```

3. Deploy:
```bash
git push heroku main
```

### 4. Vercel / Netlify

⚠️ **Note:** Vercel and Netlify have limitations with Playwright due to serverless functions. Consider using Docker-based platforms instead.

If you must use Vercel:
- Use the `vercel.json` configuration provided
- Note: Playwright may not work in serverless environments

### 5. Manual Server Deployment (VPS)

**On your server:**
```bash
# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install system dependencies
sudo apt-get update
sudo apt-get install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2

# Clone and setup
git clone <your-repo>
cd scrapper
npm install
npm run build

# Run with PM2 (recommended)
npm install -g pm2
pm2 start npm --name "scraper" -- run ui
pm2 save
pm2 startup
```

## Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Set to `production` for production

## Troubleshooting

### Error: Executable doesn't exist

**Solution:** Run `npx playwright install chromium` after deployment.

**For Docker:** The Dockerfile already includes this.

**For other platforms:** Add to your build script:
```bash
npm install && npx playwright install chromium --with-deps
```

### Error: Browser launch failed

**Solution:** Ensure all system dependencies are installed (see Dockerfile for list).

### Port already in use

**Solution:** 
- Change PORT environment variable
- Or kill the process: `lsof -ti:3000 | xargs kill -9`

## Platform-Specific Notes

### Railway
- Automatically uses Dockerfile
- No additional configuration needed

### Render
- Use Dockerfile or configure build/start commands
- May need to increase timeout for long-running scrapes

### Fly.io
- Uses Dockerfile automatically
- Scale with: `fly scale count 1`

### DigitalOcean App Platform
- Supports Dockerfile
- Set health check path: `/`

## Monitoring

Consider adding:
- Health check endpoint: `GET /health`
- Logging service (e.g., Logtail, Datadog)
- Error tracking (e.g., Sentry)

