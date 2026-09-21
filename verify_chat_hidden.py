from playwright.sync_api import sync_playwright, expect
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Go to home page
    page.goto("http://localhost:3000/index.html")

    # Wait for page to likely stabilize (Firestore init)
    page.wait_for_timeout(5000)

    # Take screenshot of main view
    if not os.path.exists("/home/jules/verification"):
        os.makedirs("/home/jules/verification")

    page.screenshot(path="/home/jules/verification/home_view_chat_hidden.png")

    # Check: Chat Icon should be hidden
    try:
        chat_btn = page.locator("#btn-menu-chat")
        expect(chat_btn).to_be_hidden(timeout=5000)
        print("PASS: Chat icon is hidden.")
    except:
        print("FAIL: Chat icon is visible!")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
