#!/bin/bash

# Playwright Cleanup Script
# Kills zombie processes and clears cache to prevent glitches

echo "🧹 Starting Playwright cleanup..."

# Kill processes on common ports
echo "🔍 Killing processes on localhost:3000..."
lsof -ti:3000 | xargs -r kill -9 2>/dev/null || echo "No processes found on port 3000"

# Kill any remaining Playwright/Chrome processes
echo "🔍 Killing Playwright browser processes..."
pkill -f "playwright" 2>/dev/null || echo "No Playwright processes found"
pkill -f "chrome" 2>/dev/null || echo "No Chrome processes found" 
pkill -f "chromium" 2>/dev/null || echo "No Chromium processes found"

# Clear Playwright MCP cache
if [ -d ".playwright-mcp" ]; then
    echo "🗑️  Clearing Playwright MCP cache..."
    rm -rf .playwright-mcp/*.png
    rm -rf .playwright-mcp/videos/*
    echo "Cache cleared"
else
    echo "📁 No Playwright MCP cache found"
fi

# Clear system temp files related to Playwright
echo "🗑️  Clearing system temp files..."
rm -rf /tmp/playwright-* 2>/dev/null || echo "No temp files found"

# Wait a moment for processes to fully terminate
sleep 2

echo "✅ Playwright cleanup complete!"
echo ""
echo "💡 Tips:"
echo "   - Run this before starting new test sessions"
echo "   - Add 'npm run cleanup' to package.json for easy access"
echo "   - Use 'chmod +x scripts/cleanup-playwright.sh' to make executable"