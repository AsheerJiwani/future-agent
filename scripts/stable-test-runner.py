#!/usr/bin/env python3
"""
Restart-Safe Test Runner for Playwright
Handles connection failures gracefully with automatic retry logic
"""

import sys
import time
import subprocess
from playwright.sync_api import sync_playwright, TimeoutError, Error
from playwright_config import create_stable_browser

def run_with_retries(test_func, max_retries=3, delay=2):
    """
    Runs a test function with automatic retry on connection failures
    """
    for attempt in range(max_retries):
        try:
            print(f"🔄 Attempt {attempt + 1}/{max_retries}")
            return test_func()
        except (TimeoutError, Error, ConnectionError) as e:
            print(f"⚠️ Attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                print(f"⏳ Waiting {delay} seconds before retry...")
                time.sleep(delay)
                # Clean up before retry
                try:
                    subprocess.run(['./scripts/cleanup-playwright.sh'], 
                                 capture_output=True, timeout=30)
                except:
                    pass
            else:
                print("❌ All retry attempts failed")
                raise
        except KeyboardInterrupt:
            print("🛑 Test interrupted by user")
            sys.exit(1)
        except Exception as e:
            print(f"💥 Unexpected error: {e}")
            raise

def safe_navigate_and_wait(page, url, wait_time=3):
    """
    Safely navigate to a URL with proper error handling
    """
    try:
        print(f"📍 Navigating to {url}...")
        page.goto(url, wait_until='networkidle', timeout=30000)
        time.sleep(wait_time)
        return True
    except TimeoutError:
        print("⏰ Navigation timeout, trying with domcontentloaded...")
        try:
            page.goto(url, wait_until='domcontentloaded', timeout=15000)
            time.sleep(wait_time)
            return True
        except:
            print("❌ Navigation failed completely")
            return False
    except Exception as e:
        print(f"❌ Navigation error: {e}")
        return False

def safe_click_element(page, selector, timeout=10000):
    """
    Safely click an element with multiple fallback strategies
    """
    selectors = [selector] if isinstance(selector, str) else selector
    
    for sel in selectors:
        try:
            print(f"🔍 Looking for element: {sel}")
            element = page.locator(sel).first
            
            # Wait for element to be visible
            element.wait_for(state='visible', timeout=timeout)
            
            # Ensure element is clickable
            if element.is_enabled() and element.is_visible():
                element.click()
                print(f"✅ Successfully clicked: {sel}")
                return True
            else:
                print(f"⚠️ Element not clickable: {sel}")
                
        except TimeoutError:
            print(f"⏰ Element timeout: {sel}")
            continue
        except Exception as e:
            print(f"❌ Click failed for {sel}: {e}")
            continue
    
    return False

def safe_screenshot(page, path, description=""):
    """
    Safely take a screenshot with error handling
    """
    try:
        page.screenshot(path=path)
        print(f"📸 Screenshot saved: {path} {description}")
        return True
    except Exception as e:
        print(f"❌ Screenshot failed: {e}")
        return False

def stable_test_runner(test_name, test_logic):
    """
    Main stable test runner with comprehensive error handling
    """
    def run_test():
        with sync_playwright() as p:
            browser, context, page = create_stable_browser(p)
            
            try:
                print(f"🚀 Starting {test_name}...")
                result = test_logic(page)
                print(f"✅ {test_name} completed successfully")
                return result
                
            except Exception as e:
                print(f"❌ {test_name} failed: {e}")
                safe_screenshot(page, f".playwright-mcp/error-{int(time.time())}.png", "(error)")
                raise
            finally:
                # Comprehensive cleanup
                try:
                    page.close()
                except:
                    pass
                try:
                    context.close()
                except:
                    pass
                try:
                    browser.close()
                except:
                    pass
                print("🧹 Cleanup completed")
    
    return run_with_retries(run_test)

# Example test that can be imported and used
def example_ol_dl_test(page):
    """
    Example test using the stable patterns
    """
    # Navigate safely
    if not safe_navigate_and_wait(page, "http://localhost:3007"):
        raise Exception("Failed to navigate to application")
    
    safe_screenshot(page, ".playwright-mcp/stable-initial.png", "(initial)")
    
    # Click Football Panel with fallback selectors
    panel_selectors = [
        "button:has-text('Football Playbook Coach')",
        "button:has-text('Read plays vs coverages')",
        ".tab-card:has-text('Football')"
    ]
    
    if not safe_click_element(page, panel_selectors):
        raise Exception("Failed to open Football Panel")
    
    time.sleep(2)
    safe_screenshot(page, ".playwright-mcp/stable-panel-opened.png", "(panel opened)")
    
    # Click Snap button with fallback selectors  
    snap_selectors = [
        "button:has-text('Snap')",
        "button:has-text('SNAP')",
        "[data-testid='snap-button']"
    ]
    
    if not safe_click_element(page, snap_selectors):
        raise Exception("Failed to click Snap button")
    
    # Take timed screenshots
    for i, interval in enumerate([0.5, 1.5, 2.5, 3.5]):
        sleep_time = interval if i == 0 else (interval - [0.5, 1.5, 2.5, 3.5][i-1])
        time.sleep(sleep_time)
        safe_screenshot(page, f".playwright-mcp/stable-{interval}s.png", f"({interval}s)")
    
    return "Test completed successfully"

if __name__ == "__main__":
    # Run the example test
    try:
        result = stable_test_runner("Stable OL/DL Test", example_ol_dl_test)
        print(f"🎉 Result: {result}")
    except Exception as e:
        print(f"💥 Test failed: {e}")
        sys.exit(1)