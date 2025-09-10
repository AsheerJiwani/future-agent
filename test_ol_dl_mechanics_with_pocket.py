#!/usr/bin/env python3
"""
Test script for enhanced OL/DL mechanics with Pocket Envelope visualization enabled
"""

from playwright.sync_api import sync_playwright
import time

def test_ol_dl_mechanics_with_pocket():
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
        page.screenshot(path=".playwright-mcp/initial-load-with-pocket.png")
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
            page.screenshot(path=".playwright-mcp/football-panel-opened-with-pocket.png")
            print("✅ Football Panel opened")
            
            # Wait for the panel to fully load
            page.wait_for_timeout(2000)
            
            # Enable Pocket Envelope visualization
            print("🔍 Looking for Pocket Envelope checkbox...")
            pocket_checkbox_selectors = [
                "input[type='checkbox'] + text():has-text('Pocket Envelope')",
                "label:has-text('Pocket Envelope') input[type='checkbox']",
                "input[type='checkbox'][checked]:near(:text('Pocket Envelope'))"
            ]
            
            pocket_checkbox = None
            for selector in pocket_checkbox_selectors:
                try:
                    if page.locator(selector).count() > 0:
                        pocket_checkbox = page.locator(selector).first
                        print(f"✅ Found Pocket Envelope checkbox with selector: {selector}")
                        break
                except:
                    continue
            
            # Alternative approach - look for any checkbox near "Pocket Envelope" text
            if not pocket_checkbox:
                print("🔍 Searching for Pocket Envelope checkbox using alternative method...")
                try:
                    # Find all checkboxes and check nearby text
                    checkboxes = page.locator("input[type='checkbox']").all()
                    for i, checkbox in enumerate(checkboxes):
                        # Get surrounding text to identify the pocket envelope checkbox
                        parent = checkbox.locator("..").first
                        text_content = parent.text_content()
                        if "pocket" in text_content.lower() or "envelope" in text_content.lower():
                            pocket_checkbox = checkbox
                            print(f"✅ Found Pocket Envelope checkbox #{i+1} via text content")
                            break
                except Exception as e:
                    print(f"⚠️ Error searching for checkbox: {e}")
            
            if pocket_checkbox:
                print("✅ Enabling Pocket Envelope visualization...")
                pocket_checkbox.click()
                page.wait_for_timeout(500)
                page.screenshot(path=".playwright-mcp/pocket-envelope-enabled.png")
                print("✅ Pocket Envelope enabled")
            else:
                print("⚠️ Could not find Pocket Envelope checkbox, continuing anyway...")
            
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
                
                # Take screenshots at key intervals to test OL/DL mechanics WITH POCKET VISUALIZATION
                print("\n🔥 TESTING ENHANCED OL/DL MECHANICS WITH POCKET ENVELOPE:")
                print("   📏 Verifying tighter pocket formation (9x4 yards)")
                print("   🎯 Checking DL engagement with individual OL blockers")
                print("   ⏱️  Monitoring timing-based DL rush phases")
                print("   👁️  POCKET ENVELOPE VISUALIZATION ENABLED\n")
                
                time_intervals = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5]
                
                for i, interval in enumerate(time_intervals):
                    # Calculate sleep time (first interval is absolute, others are relative)
                    sleep_time = interval if i == 0 else (interval - time_intervals[i-1])
                    time.sleep(sleep_time)
                    
                    filename = f".playwright-mcp/pocket-ol-dl-{interval}s.png"
                    page.screenshot(path=filename)
                    print(f"📸 Screenshot at {interval}s: {filename}")
                    
                    if interval == 0.5:
                        print("   ⚡ PHASE 1: DL initial rush toward assigned OL (0-0.5s)")
                    elif interval == 1.5:
                        print("   🤝 PHASE 2: DL-OL engagement/jockeying begins (0.5-2.7s)")
                    elif interval == 2.5:
                        print("   🔄 PHASE 2: Most DL still jockeying, pocket holding")
                    elif interval == 3.0:
                        print("   💥 PHASE 3: Protection breakdown starts (2.7s+)")
                    elif interval == 3.5:
                        print("   🎯 BREAKTHROUGH: Single DL breaking through")
                    elif interval == 4.0:
                        print("   🌪️  POCKET COLLAPSE: Advanced breakdown")
                
                # Take final screenshot
                time.sleep(1)
                page.screenshot(path=".playwright-mcp/pocket-ol-dl-final.png")
                print("📸 Final state screenshot taken")
                print("\n✅ OL/DL mechanics with Pocket Envelope test completed!")
                
            else:
                print("❌ Could not find Snap button")
                page.screenshot(path=".playwright-mcp/no-snap-button-pocket.png")
                
        else:
            print("❌ Could not find Football Panel button")
            page.screenshot(path=".playwright-mcp/no-football-panel-pocket.png")
        
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
    test_ol_dl_mechanics_with_pocket()