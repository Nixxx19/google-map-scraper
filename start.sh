#!/bin/bash
set -e

echo "🔍 Verifying Playwright browsers are installed..."

# Check if browsers exist in common locations
if [ ! -d "node_modules/.cache/ms-playwright" ] && [ ! -d "/ms-playwright" ] && [ ! -d "$HOME/.cache/ms-playwright" ]; then
    echo "⚠️  Browsers not found. Installing..."
    npx playwright install chromium --with-deps || npx playwright install chromium
    echo "✅ Browsers installed"
else
    echo "✅ Browsers found in cache"
fi

# Verify installation
echo "📦 Playwright version:"
npx playwright --version || echo "⚠️  Playwright version check failed"

echo "🚀 Starting server..."
exec npm run ui
