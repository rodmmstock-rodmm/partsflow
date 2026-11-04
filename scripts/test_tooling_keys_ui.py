"""Desktop/mobile browser coverage for Tooling Vehicle Keys on disposable SQLite."""
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:4173"
EMPLOYEE_CODE = "UI-TEST-001"
KEY_LABEL = "E2E Test Vehicle Key"


def login(page):
    page.goto(f"{BASE_URL}/login", wait_until="networkidle")
    page.get_by_label("Employee Code").fill(EMPLOYEE_CODE)
    page.get_by_role("button", name="Login").click()
    page.wait_for_function(
        "() => !!sessionStorage.getItem('partsflow_auth_token') || "
        "!!localStorage.getItem('partsflow_auth_token')",
        timeout=10000,
    )


def test_desktop_key_borrow_return_and_edit_history(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    login(page)
    page.goto(f"{BASE_URL}/tooling-keys", wait_until="networkidle")
    page.get_by_role("heading", name="ยืม-คืนกุญแจไขรถเครื่องมือ").wait_for()
    page.get_by_text(KEY_LABEL).wait_for()

    page.get_by_role("button", name="ยืมกุญแจ").click()
    page.get_by_label("ชื่อผู้ยืม *").select_option(label="Tooling UI Tester")
    page.get_by_role("button", name="ยืนยันการยืม").click()
    page.get_by_text("บันทึกการยืมกุญแจแล้ว").wait_for()

    page.get_by_role("button", name="คืนกุญแจ").click()
    page.get_by_role("button", name="ยืนยันการคืน").click()
    page.get_by_text("บันทึกการคืนกุญแจแล้ว").wait_for()

    page.get_by_role("button", name="ประวัติการยืม-คืน").click()
    row = page.locator("article.panel").filter(has_text="รถเครื่องมือหมายเลข 7")
    row.get_by_text("Tooling UI Tester").wait_for()
    row.get_by_text("Tooling UI Tester").wait_for()
    row.get_by_role("button", name="แก้ไขประวัติ").click()

    returner = page.locator("select").last
    returner.select_option(label="Tooling UI Returner")
    page.get_by_role("button", name="บันทึกประวัติ").click()
    page.get_by_text("แก้ไขประวัติการยืม-คืนแล้ว").wait_for()
    page.locator("article.panel").filter(has_text="รถเครื่องมือหมายเลข 7").get_by_text("Tooling UI Returner").wait_for()
    page.close()


def test_mobile_key_page_and_history_are_responsive(browser):
    page = browser.new_page(
        viewport={"width": 390, "height": 844},
        is_mobile=True,
        has_touch=True,
    )
    login(page)
    page.goto(f"{BASE_URL}/tooling-keys", wait_until="networkidle")
    page.get_by_role("heading", name="ยืม-คืนกุญแจไขรถเครื่องมือ").wait_for()
    page.get_by_text(KEY_LABEL).wait_for()
    page.get_by_role("button", name="ประวัติการยืม-คืน").click()
    page.get_by_text("Tooling UI Returner").wait_for()
    dimensions = page.evaluate(
        "() => ({width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth})"
    )
    assert dimensions["scroll"] <= dimensions["width"], dimensions
    page.close()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            test_desktop_key_borrow_return_and_edit_history(browser)
            test_mobile_key_page_and_history_are_responsive(browser)
        finally:
            browser.close()
    print("PASS: Tooling Vehicle Keys desktop borrow/return/history edit and mobile responsive history")


if __name__ == "__main__":
    main()
