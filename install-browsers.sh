#!/bin/bash
# Script to install Playwright browsers
# Run this after npm install if browsers aren't installed

echo "Installing Playwright browsers..."
npx playwright install chromium --with-deps

if [ $? -eq 0 ]; then
    echo "✅ Playwright browsers installed successfully"
else
    echo "⚠️  Installing without system dependencies..."
    npx playwright install chromium
    echo "✅ Playwright browsers installed (may need system dependencies)"
fi

