# Playwright Stability Guide

This document outlines the stability improvements implemented to prevent Playwright glitches and restart requirements.

## Quick Start

### Before Running Tests
```bash
# Clean up any zombie processes and cache
npm run cleanup

# Monitor current system state
npm run monitor
```

### Running Tests
```bash
# Run tests with automatic cleanup
npm run test:clean      # Basic OL/DL mechanics test
npm run test:focused    # Focused mechanics test 
npm run test:pocket     # Pocket visualization test
npm run test:stable     # New stable test runner with retries
```

## Prevention Strategies Implemented

### 1. Process Management
- **Cleanup Script**: `scripts/cleanup-playwright.sh` kills zombie processes and clears cache
- **Process Monitor**: `scripts/monitor-processes.sh` detects long-running processes and port conflicts
- **Automatic Cleanup**: All test commands now run cleanup automatically

### 2. Browser Configuration
- **macOS Optimized Settings**: `scripts/playwright-config.py` provides stable browser launch options
- **Resource Management**: Disabled unnecessary features to reduce memory usage
- **Proper Timeouts**: Configured appropriate timeouts for macOS environment

### 3. Error Handling & Retries
- **Stable Test Runner**: `scripts/stable-test-runner.py` handles connection failures gracefully
- **Try-Finally Blocks**: All test files now have proper cleanup in finally blocks
- **Retry Logic**: Automatic retries on connection failures with cleanup between attempts

### 4. Resource Isolation
- **Separate Contexts**: Each test uses isolated browser contexts
- **Explicit Cleanup**: All browsers, contexts, and pages are properly closed
- **Cache Management**: Regular cleanup of screenshot and video cache

## Browser Launch Configuration

The optimized configuration includes:

```python
# Memory and performance optimizations
'--disable-dev-shm-usage'
'--disable-background-timer-throttling'
'--disable-backgrounding-occluded-windows'
'--disable-renderer-backgrounding'

# Security and stability  
'--no-sandbox'
'--disable-web-security'
'--disable-features=TranslateUI'
'--disable-ipc-flooding-protection'

# Resource reduction
'--disable-extensions'
'--disable-plugins'
'--disable-javascript-harmony-shipping'

# macOS specific optimizations
'--disable-background-mode'
'--disable-component-extensions-with-background-pages'
'--disable-default-apps'
'--disable-sync'
```

## File Structure

```
scripts/
├── cleanup-playwright.sh      # Process cleanup script
├── monitor-processes.sh       # Process monitoring utility  
├── playwright-config.py       # Browser configuration
└── stable-test-runner.py      # Retry-enabled test runner

test_ol_dl_*.py                # Updated test files with proper cleanup
package.json                   # Added npm scripts for easy access
```

## NPM Scripts Added

```json
{
  "cleanup": "./scripts/cleanup-playwright.sh",
  "monitor": "./scripts/monitor-processes.sh", 
  "test:clean": "npm run cleanup && python test_ol_dl_mechanics.py",
  "test:focused": "npm run cleanup && python test_ol_dl_focused.py",
  "test:pocket": "npm run cleanup && python test_ol_dl_mechanics_with_pocket.py",
  "test:stable": "npm run cleanup && python scripts/stable-test-runner.py"
}
```

## Troubleshooting

### Still Getting Glitches?

1. **Check for zombie processes**:
   ```bash
   npm run monitor
   ```

2. **Force cleanup**:
   ```bash
   npm run cleanup
   # Wait 5 seconds, then run your test
   ```

3. **Kill specific ports**:
   ```bash
   lsof -ti:3000 | xargs kill -9
   ```

4. **Use stable test runner**:
   ```bash
   npm run test:stable
   ```

### Common Issues

- **Port conflicts**: Multiple services on localhost:3000
- **Long-running browsers**: Chrome processes not terminating properly
- **Cache buildup**: Screenshots and videos consuming disk space
- **Memory leaks**: Browser processes accumulating over time

## Best Practices

1. **Always run cleanup** before starting new test sessions
2. **Use the stable test runner** for critical tests
3. **Monitor processes regularly** during development
4. **Close terminals properly** to ensure process cleanup
5. **Use try-finally blocks** in custom test scripts

## Monitoring Commands

```bash
# Check what's using ports
lsof -i :3000,3001,3006,3007,9222

# Find all Chrome/Playwright processes  
ps aux | grep -E "(chrome|playwright)"

# Check cache size
du -sh .playwright-mcp/

# View system load
top -l 1 | head -n 10
```

This setup should eliminate the need for frequent Playwright restarts and provide a more stable testing experience on macOS.