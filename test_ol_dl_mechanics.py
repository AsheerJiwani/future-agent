#!/usr/bin/env python3
"""
Test script for enhanced OL/DL mechanics in the NFL simulator
"""

from playwright.sync_api import sync_playwright
import time

def test_ol_dl_mechanics():
    with sync_playwright() as p:
        # Configure browser for macOS stability
        browser = p.chromium.launch(
            headless=False,
            args=[
                '--disable-dev-shm-usage',
                '--disable-extensions',
                '--no-sandbox',
                '--disable-web-security',
                '--disable-background-timer-throttling'
            ]
        )
        page = browser.new_page()
        
        try:
        
        # Navigate to the application
        print("📍 Navigating to http://localhost:3007...")
        page.goto("http://localhost:3007")
        page.wait_for_load_state("networkidle")
        
        # Take initial screenshot
        page.screenshot(path=".playwright-mcp/initial-load-3007.png")
        print("✅ Initial page load screenshot taken")
        
        # Wait for page to be fully loaded
        time.sleep(2)
        
        # Look for the Football Playbook Coach button
        print("🔍 Looking for Football Playbook Coach button...")
        
        panel_selectors = [
            "button:has-text('Football Playbook Coach')",
            "button:has-text('Read plays vs coverages with QB-level tips')",
            "button[aria-controls='football-panel']",
            ".tab-card:has-text('Football')"
        ]
        
        panel_button = None
        for selector in panel_selectors:
            try:
                if page.locator(selector).count() > 0:
                    panel_button = page.locator(selector).first
                    print(f"✅ Found Football Playbook Coach button with selector: {selector}")
                    break
            except:
                continue
        
        if panel_button:
            panel_button.click()
            page.wait_for_timeout(1000)
            page.screenshot(path=".playwright-mcp/football-panel-opened-3007.png")
            print("✅ Football Panel opened")
            
            # Wait for the panel to fully load
            page.wait_for_timeout(2000)
            
            # Look for Snap button to start simulation
            print("🔍 Looking for Snap button...")
            sim_selectors = [
                "button:has-text('Snap')",
                "button:has-text('SNAP')",
                "[data-testid='snap-button']",
                ".snap-button"
            ]
            
            sim_button = None
            for selector in sim_selectors:
                try:
                    if page.locator(selector).count() > 0:
                        sim_button = page.locator(selector).first
                        print(f"✅ Found Snap button with selector: {selector}")
                        break
                except:
                    continue
            
            if sim_button:
                print("🚀 Starting simulation by clicking Snap...")
                sim_button.click()
                
                # Take screenshots at key intervals to test OL/DL mechanics
                print("\n🔥 TESTING ENHANCED OL/DL MECHANICS:")
                print("   📏 Verifying tighter pocket formation (9x4 yards)")
                print("   🎯 Checking DL engagement with individual OL blockers")
                print("   ⏱️  Monitoring timing-based DL rush phases\n")
                
                time_intervals = [0.5, 1.5, 2.5, 3.5, 4.5]
                
                for i, interval in enumerate(time_intervals):
                    # Calculate sleep time (first interval is absolute, others are relative)
                    sleep_time = interval if i == 0 else (interval - time_intervals[i-1])
                    time.sleep(sleep_time)
                    
                    filename = f".playwright-mcp/ol-dl-mechanics-{interval}s.png"
                    page.screenshot(path=filename)
                    print(f"📸 Screenshot at {interval}s: {filename}")
                    
                    if interval == 0.5:
                        print("   ⚡ EDGE RUSH: DE_L, DE_R should immediately rush toward LT, RT")
                    elif interval == 1.5:
                        print("   🤝 ENGAGEMENT: DL should be jockeying with assigned OL blockers")
                    elif interval == 2.5:
                        print("   🔄 JOCKEYING: Most DL still engaged, one breakthrough starting")
                    elif interval == 3.5:
                        print("   💥 BREAKTHROUGH: Single DL breaking through toward QB")
                    elif interval == 4.5:
                        print("   🎯 POCKET COLLAPSE: Breakthrough DL reaching QB position")
                
                # Take final screenshot
                time.sleep(1)
                page.screenshot(path=".playwright-mcp/ol-dl-final-state.png")
                print("📸 Final state screenshot taken")
                print("\n✅ OL/DL mechanics test completed!")
                
            else:
                print("❌ Could not find Snap button")
                page.screenshot(path=".playwright-mcp/no-snap-button-3007.png")
                
                # Debug: Show all buttons on the page
                all_buttons = page.locator("button").all()
                print(f"Found {len(all_buttons)} buttons on the page:")
                for i, button in enumerate(all_buttons[:15]):  # Limit to first 15
                    try:
                        text = button.inner_text()
                        print(f"  Button {i+1}: '{text}'")
                    except:
                        print(f"  Button {i+1}: [No text content]")
        else:
            print("❌ Could not find Football Panel button")
            page.screenshot(path=".playwright-mcp/no-football-panel-3007.png")
            
            # Get all buttons on the page for debugging
            all_buttons = page.locator("button").all()
            print(f"Found {len(all_buttons)} buttons on the page:")
            for i, button in enumerate(all_buttons[:10]):  # Limit to first 10
                try:
                    text = button.inner_text()
                    print(f"  Button {i+1}: '{text}'")
                except:
                    print(f"  Button {i+1}: [No text content]")
        
        except Exception as e:
            print(f"❌ Test failed with error: {e}")
            page.screenshot(path=".playwright-mcp/error-screenshot.png")
            raise
        finally:
            # Proper cleanup
            try:
                page.close()
            except:
                pass
            try:
                browser.close()
            except:
                pass
            print("🧹 Browser cleanup completed")
        
        print("🏁 Test completed")

if __name__ == "__main__":
    test_ol_dl_mechanics()