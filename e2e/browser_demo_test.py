"""
Browser end-to-end test of the GreenPulse demo, driven through the real UI (Playwright + Chromium).

The inspector's browser gets a *fake camera* whose video is the QR code that the admin page actually
rendered, so html5-qrcode really decodes it and the backend really resolves the token in MongoDB.

Run (server must be running and serving client/dist on :5000):   python3 e2e/browser_demo_test.py
"""
import os, re, subprocess, sys, json
from PIL import Image
import numpy as np
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE", "http://localhost:5000")
PW = "GreenPulse@123"
SHOTS = "/tmp/shots"; os.makedirs(SHOTS, exist_ok=True)
expect.set_options(timeout=15000)
steps = []

def step(msg):
    steps.append(msg); print(f"  ✔ {msg}", flush=True)

def photo(path, seed):
    rng = np.random.default_rng(seed)
    Image.fromarray(rng.integers(0, 255, (160, 160, 3), dtype=np.uint8)).save(path)
    return path

def login(page, email, password=PW):
    page.goto(f"{BASE}/login")
    page.get_by_label("Email").fill(email)
    page.get_by_label("Password").fill(password)
    page.get_by_role("button", name="Sign in", exact=True).click()

def api(ctx, path):
    r = ctx.request.get(f"{BASE}/api{path}")
    return r.status, (r.json() if r.ok else None)

def row(page, text):
    return page.locator("tr", has_text=text)

with sync_playwright() as p:
    # ------------------------------------------------------------------ ADMIN (laptop)
    b_admin = p.chromium.launch()
    admin_ctx = b_admin.new_context(viewport={"width": 1280, "height": 900})
    admin = admin_ctx.new_page()

    login(admin, "admin@gmail.com")
    expect(admin).to_have_url(re.compile(r"/admin/dashboard"))
    expect(admin.get_by_test_id("header-user")).to_contain_text("admin@gmail.com")
    expect(admin.get_by_test_id("header-user")).to_contain_text("ADMIN")
    step("common login: admin@gmail.com -> /admin/dashboard, name/email/ROLE visible")

    _, before = api(admin_ctx, "/dashboard/admin")
    b = before["summary"]
    assert b["totalInspections"] >= 9, "demo history should be seeded"
    assert len(before["trends"]) == 6 and any(t["score"] is not None for t in before["trends"])
    assert before["leaderboard"] and before["risks"]
    step(f"seeded demo history is live in the dashboard: {b['totalInspections']} inspections, {b['openIssues']} open issues, {len(before['risks'])} risk alerts")
    admin.screenshot(path=f"{SHOTS}/01_admin_dashboard.png", full_page=True)

    admin.goto(f"{BASE}/admin/locations")
    expect(admin.get_by_role("heading", name="Locations & QR codes")).to_be_visible()
    assert admin.get_by_text("Main Canteen").count() == 0, admin.get_by_text("Main Canteen").all_inner_texts()
    admin.get_by_test_id("loc-name").fill("Main Canteen")
    admin.get_by_test_id("loc-dept").fill("Facilities")
    admin.get_by_test_id("create-location").click()
    expect(admin.get_by_test_id("qr-canvas")).to_be_visible()
    qr_url = admin.get_by_test_id("qr-url").inner_text().strip()
    token = re.search(r"/inspect/([a-f0-9]{48})$", qr_url).group(1)
    step(f"created Main Canteen; QR generated -> {qr_url[:52]}…")
    admin.locator("canvas[data-testid=qr-canvas]").screenshot(path="/tmp/qr_canvas.png")
    admin.screenshot(path=f"{SHOTS}/02_qr_modal.png")
    # QR is different per location
    admin.keyboard.press("Escape"); admin.get_by_label("Close").click()
    admin.get_by_test_id("view-qr-Library").click()
    other_url = admin.get_by_test_id("qr-url").inner_text().strip()
    assert other_url != qr_url
    admin.get_by_label("Close").click()
    step("another location has a different QR")

    # make a "camera" whose picture is that QR code
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", "/tmp/qr_canvas.png", "-vf",
                    "scale=340:340:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2:white", "-t", "2", "-r", "10", "-pix_fmt", "yuv420p", "/tmp/qr.y4m"], check=True)

    # refresh + unknown route on admin side
    admin.goto(f"{BASE}/admin/locations"); admin.reload()
    expect(admin.get_by_role("heading", name="Locations & QR codes")).to_be_visible()
    admin.goto(f"{BASE}/definitely-not-a-page")
    expect(admin.get_by_text("This page does not exist")).to_be_visible()
    step("direct URL + browser refresh work; unknown route shows 404 page")

    # ------------------------------------------------------------------ STAFF cannot use the QR / inspector routes
    b_staff = p.chromium.launch()
    staff_ctx = b_staff.new_context(viewport={"width": 1280, "height": 900})
    staff = staff_ctx.new_page()
    login(staff, "staff@gmail.com")
    expect(staff).to_have_url(re.compile(r"/staff/dashboard"))
    staff.goto(f"{BASE}/inspect/{token}")
    expect(staff.get_by_test_id("access-restricted")).to_contain_text("403")
    staff.goto(f"{BASE}/admin/dashboard")
    expect(staff.get_by_test_id("access-restricted")).to_be_visible()
    assert staff_ctx.request.get(f"{BASE}/api/locations").status == 403
    assert staff_ctx.request.get(f"{BASE}/api/locations/qr/{token}").status == 403
    step("STAFF opening /inspect/<token> or /admin sees 403 page; direct API calls return 403")

    # ------------------------------------------------------------------ INSPECTOR (phone with camera)
    b_insp = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-video-capture=/tmp/qr.y4m"])
    insp_ctx = b_insp.new_context(viewport={"width": 420, "height": 860}, permissions=["camera"], has_touch=True, is_mobile=True)
    insp = insp_ctx.new_page()

    insp.goto(f"{BASE}/inspect/{token}")           # unauthenticated -> login, then continue
    expect(insp).to_have_url(re.compile(r"/login\?next="))
    insp.get_by_label("Email").fill("inspector@gmail.com"); insp.get_by_label("Password").fill(PW)
    insp.get_by_role("button", name="Sign in", exact=True).click()
    expect(insp.get_by_test_id("inspect-location")).to_contain_text("Main Canteen")
    step("unauthenticated QR URL -> login -> inspector lands on the Main Canteen inspection page")
    insp.reload()
    expect(insp.get_by_test_id("inspect-location")).to_contain_text("Main Canteen")
    step("browser refresh on /inspect/<token> works")

    insp.goto(f"{BASE}/inspect/{'ab' * 24}")
    expect(insp.get_by_test_id("qr-error-title")).to_have_text("Location not found")
    step("invalid QR token -> 'Location not found' (app does not crash)")

    # ---- REAL CAMERA SCAN
    insp.goto(f"{BASE}/inspector/scan")
    insp.get_by_test_id("start-camera").click()
    expect(insp).to_have_url(re.compile(rf"/inspect/{token}"), timeout=40000)
    expect(insp.get_by_test_id("inspect-location")).to_contain_text("Main Canteen")
    step("CAMERA scan: html5-qrcode decoded the QR frames, backend resolved the token, Main Canteen inspection opened")
    insp.screenshot(path=f"{SHOTS}/03_inspection_page.png", full_page=True)

    for t, v in [("Cleanliness", "COMPLIANT"), ("Waste Segregation", "NON_COMPLIANT"), ("Dustbin Availability", "COMPLIANT"), ("Water Leakage", "COMPLIANT"), ("Washroom Hygiene", "COMPLIANT")]:
        insp.get_by_test_id(f"res-{t}-{v}").check()
    assert insp.locator("input[type=radio][name]").count() == 15, "checklist should have exactly the 5 core items (15 radios)"
    insp.get_by_test_id("remarks-Waste Segregation").fill("Wet and dry waste are mixed.")
    insp.get_by_test_id("photo-input").set_input_files(photo("/tmp/before.png", 1))
    expect(insp.locator("img[alt=evidence]")).to_have_count(1)
    expect(insp.get_by_test_id("live-score")).to_contain_text("80%")
    step("checklist filled from MongoDB (5 items), BEFORE photo uploaded, live score 80%")
    insp.get_by_test_id("submit-inspection").click()
    expect(insp.get_by_test_id("result-score")).to_have_text("80%")
    expect(insp.get_by_test_id("inspection-result")).to_contain_text("Waste Segregation")
    expect(insp.get_by_test_id("inspection-result")).to_contain_text("GOOD")
    step("submitted: server score 4/5 = 80%, issue 'Waste Segregation' auto-created")
    insp.screenshot(path=f"{SHOTS}/04_result.png", full_page=True)

    # ------------------------------------------------------------------ ADMIN assigns
    admin.goto(f"{BASE}/admin/issues")
    row(admin, "Main Canteen").get_by_role("link").first.click()
    expect(admin.get_by_role("heading", name="Waste Segregation")).to_be_visible()
    expect(admin.get_by_text("Wet and dry waste are mixed.").first).to_be_visible()
    expect(admin.locator("img[alt='BEFORE evidence']")).to_have_count(1)
    admin.get_by_test_id("assign-select").select_option(label="Ravi Kumar — staff@gmail.com")
    admin.get_by_role("button", name="Assign", exact=True).click()
    expect(admin.locator(".status-pill", has_text="assigned").first).to_be_visible()
    # only STAFF users are offered
    opts = admin.get_by_test_id("assign-select").locator("option").all_inner_texts()
    assert all("inspector@" not in o and "admin@" not in o for o in opts), opts
    step("admin sees the issue with BEFORE photo, assigns it to staff@gmail.com (only STAFF listed)")
    admin.screenshot(path=f"{SHOTS}/05_admin_issue.png", full_page=True)

    # ------------------------------------------------------------------ STAFF resolves
    staff.goto(f"{BASE}/staff/issues")
    expect(row(staff, "Main Canteen")).to_have_count(1)
    assert staff.locator("tbody tr").count() >= 1
    row(staff, "Main Canteen").get_by_role("link").click()
    staff.get_by_role("button", name="Start work").click()
    expect(staff.get_by_text("Update issue")).to_be_visible()
    staff.get_by_test_id("resolution-remarks").fill("Wet and dry waste bins were arranged separately.")
    expect(staff.get_by_test_id("submit-verification")).to_be_disabled()   # needs an AFTER photo
    staff.get_by_test_id("photo-input").set_input_files(photo("/tmp/after1.png", 2))
    expect(staff.locator("img[alt=evidence]")).to_have_count(1)
    staff.get_by_test_id("submit-verification").click()
    expect(staff.get_by_text("waiting for an inspector")).to_be_visible()
    step("staff sees only their issue, starts work, cannot submit without AFTER photo, uploads it, submits for verification")
    staff.reload(); expect(staff.get_by_text("waiting for an inspector")).to_be_visible()

    # ------------------------------------------------------------------ INSPECTOR rejects, staff redoes, inspector approves
    insp.goto(f"{BASE}/inspector/verifications")
    expect(insp.get_by_test_id("review-Waste Segregation")).to_be_visible()
    insp.get_by_test_id("review-Waste Segregation").click()
    expect(insp.locator("img[alt='BEFORE evidence']")).to_have_count(1)
    expect(insp.locator("img[alt='AFTER evidence']")).to_have_count(1)
    expect(insp.get_by_text("Wet and dry waste bins were arranged separately.").first).to_be_visible()
    step("verification queue shows BEFORE + AFTER evidence and staff resolution remarks")
    insp.screenshot(path=f"{SHOTS}/06_verification.png", full_page=True)
    expect(insp.get_by_test_id("reject-btn")).to_be_disabled()             # remarks required
    insp.get_by_test_id("verify-remarks").fill("Bins are not labelled yet.")
    insp.get_by_test_id("reject-btn").click()
    expect(insp.locator(".status-pill", has_text="in progress").first).to_be_visible()
    step("inspector REJECTS with remarks -> issue back to IN PROGRESS")

    staff.goto(f"{BASE}/staff/issues"); row(staff, "Main Canteen").get_by_role("link").click()
    expect(staff.get_by_test_id("rejection-banner")).to_contain_text("Bins are not labelled yet.")
    expect(staff.get_by_test_id("submit-verification")).to_be_disabled()   # old photo does not count
    staff.get_by_test_id("resolution-remarks").fill("Labelled every bin as wet / dry / recyclable.")
    staff.get_by_test_id("photo-input").set_input_files(photo("/tmp/after2.png", 3))
    expect(staff.locator("img[alt=evidence]")).to_have_count(1)
    staff.get_by_test_id("submit-verification").click()
    expect(staff.get_by_text("waiting for an inspector")).to_be_visible()
    step("staff sees rejection reason, must upload a NEW after-photo, resubmits")

    insp.goto(f"{BASE}/inspector/verifications"); insp.get_by_test_id("review-Waste Segregation").click()
    insp.get_by_test_id("verify-remarks").fill("Looks good now.")
    insp.get_by_test_id("approve-btn").click()
    expect(insp.locator(".status-pill", has_text="closed").first).to_be_visible()
    expect(insp.get_by_test_id("approve-btn")).to_have_count(0)
    step("inspector APPROVES -> issue CLOSED")
    insp.screenshot(path=f"{SHOTS}/07_closed.png", full_page=True)

    # ------------------------------------------------------------------ DASHBOARD moved
    _, after = api(admin_ctx, "/dashboard/admin"); a = after["summary"]
    assert a["totalInspections"] == b["totalInspections"] + 1, (a, b)
    assert a["resolvedIssues"] == b["resolvedIssues"] + 1, (a, b)
    assert a["openIssues"] == b["openIssues"], (a, b)
    assert a["totalLocations"] == b["totalLocations"] + 1
    _, impact = api(admin_ctx, "/impact"); assert impact["totals"]["issuesClosed"] >= 1
    admin.goto(f"{BASE}/admin/dashboard"); expect(admin.get_by_text("Completed inspections")).to_be_visible()
    admin.screenshot(path=f"{SHOTS}/08_admin_dashboard_after.png", full_page=True)
    for path, heading in [("/admin/reports", "Reports"), ("/admin/impact", "Environmental impact"), ("/admin/inspections", "Inspection history"), ("/admin/team", "Team & access"), ("/admin/standards", "Standards & checklists")]:
        admin.goto(f"{BASE}{path}"); expect(admin.get_by_role("heading", name=heading)).to_be_visible()
        admin.reload(); expect(admin.get_by_role("heading", name=heading)).to_be_visible()
    step(f"dashboard moved: inspections {b['totalInspections']}->{a['totalInspections']}, resolved {b['resolvedIssues']}->{a['resolvedIssues']}, open unchanged {a['openIssues']}; all admin pages load + refresh")

    # notifications persisted
    staff.goto(f"{BASE}/staff/notifications"); expect(staff.get_by_text("Fix approved")).to_be_visible()
    insp.goto(f"{BASE}/inspector/dashboard"); expect(insp.get_by_text("Awaiting my verification")).to_be_visible()
    step("notifications are stored and shown per role")

    # ------------------------------------------------------------------ LOGOUT / protection
    admin.get_by_role("button", name="Sign out").first.click() if admin.get_by_role("button", name="Sign out").count() else None
    admin.goto(f"{BASE}/admin/dashboard")
    expect(admin).to_have_url(re.compile(r"/login"))
    assert admin_ctx.request.get(f"{BASE}/api/auth/me").status == 401
    step("after logout protected routes redirect to /login and the API returns 401")

    for b_ in (b_admin, b_staff, b_insp): b_.close()

print(f"\nALL {len(steps)} BROWSER CHECKS PASSED")
