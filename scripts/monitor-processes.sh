#!/bin/bash

# Process Monitoring Utility for Playwright
# Detects zombie browsers and port conflicts

echo "🔍 Playwright Process Monitor"
echo "============================"

# Check for processes on common ports
echo "📊 Port Usage:"
for port in 3000 3001 3006 3007 9222; do
    process=$(lsof -ti:$port 2>/dev/null)
    if [ -n "$process" ]; then
        pid_info=$(ps -p $process -o pid,command --no-headers 2>/dev/null)
        echo "  Port $port: PID $process - $pid_info"
    else
        echo "  Port $port: ✅ Available"
    fi
done

echo ""
echo "🖥️  Browser Processes:"

# Check for Chrome/Chromium processes
chrome_processes=$(pgrep -f "chrome" 2>/dev/null)
if [ -n "$chrome_processes" ]; then
    echo "  Chrome/Chromium processes found:"
    for pid in $chrome_processes; do
        process_info=$(ps -p $pid -o pid,etime,command --no-headers 2>/dev/null)
        echo "    $process_info"
    done
else
    echo "  ✅ No Chrome/Chromium processes found"
fi

# Check for Playwright processes
playwright_processes=$(pgrep -f "playwright" 2>/dev/null)
if [ -n "$playwright_processes" ]; then
    echo "  Playwright processes found:"
    for pid in $playwright_processes; do
        process_info=$(ps -p $pid -o pid,etime,command --no-headers 2>/dev/null)
        echo "    $process_info"
    done
else
    echo "  ✅ No Playwright processes found"
fi

echo ""
echo "💾 Cache Status:"
if [ -d ".playwright-mcp" ]; then
    file_count=$(find .playwright-mcp -name "*.png" | wc -l)
    video_count=$(find .playwright-mcp/videos -name "*.webm" 2>/dev/null | wc -l)
    echo "  Screenshots: $file_count files"
    echo "  Videos: $video_count files"
    
    # Calculate cache size
    cache_size=$(du -sh .playwright-mcp 2>/dev/null | cut -f1)
    echo "  Cache size: $cache_size"
else
    echo "  ✅ No cache directory found"
fi

echo ""
echo "🚨 Zombie Detection:"

# Detect long-running browser processes (over 5 minutes)
long_running=$(ps -eo pid,etime,command | grep -E "(chrome|chromium|playwright)" | grep -v grep | awk '$2 ~ /:/ && $2 !~ /00:0[0-4]:/ {print $0}')

if [ -n "$long_running" ]; then
    echo "  ⚠️  Long-running processes detected (>5min):"
    echo "$long_running" | while read line; do
        echo "    $line"
    done
    echo ""
    echo "  💡 Consider running: npm run cleanup"
else
    echo "  ✅ No zombie processes detected"
fi

# Check system resources
echo ""
echo "📈 System Resources:"
echo "  CPU Load: $(uptime | awk -F'load average:' '{print $2}')"
echo "  Memory: $(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//')000 bytes free"

echo ""
echo "🛠️  Quick Actions:"
echo "  npm run cleanup     - Clean up all Playwright processes and cache"
echo "  npm run test:clean  - Run tests with automatic cleanup"
echo "  ./scripts/cleanup-playwright.sh - Manual cleanup script"