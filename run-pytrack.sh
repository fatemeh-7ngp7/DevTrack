#!/bin/bash
# اجرای پروژه PyTrack با Docker Compose و باز کردن آن در حالت "برنامه مستقل"
# ================================================================

set -e

PROJECT_DIR="/home/fati/my_projects/pytrack"
FRONTEND_URL="http://localhost:3000"
LOGFILE="/tmp/pytrack-launcher.log"

echo "=== PyTrack Launcher: $(date) ===" >> "$LOGFILE"

cd "$PROJECT_DIR" || {
    notify-send "PyTrack" "پوشه پروژه پیدا نشد: $PROJECT_DIR" 2>/dev/null
    exit 1
}

notify-send "PyTrack" "در حال بالا آوردن سرویس‌ها..." 2>/dev/null || true

docker compose up -d --build >> "$LOGFILE" 2>&1

echo "در حال صبر برای آماده شدن سرویس..." >> "$LOGFILE"
for i in $(seq 1 60); do
    if curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" 2>/dev/null | grep -qE "^[23]"; then
        echo "سرویس آماده شد." >> "$LOGFILE"
        break
    fi
    sleep 1
done

# --------------------------------------------------------------
# باز کردن در حالت "App Mode" (بدون نوار آدرس، بدون تب‌ها)
# --------------------------------------------------------------
PROFILE_DIR="$HOME/.local/share/pytrack-app-profile"
mkdir -p "$PROFILE_DIR"

BROWSER_BIN=""
for candidate in google-chrome google-chrome-stable chromium chromium-browser brave-browser microsoft-edge; do
    if command -v "$candidate" >/dev/null 2>&1; then
        BROWSER_BIN="$candidate"
        break
    fi
done

if [ -n "$BROWSER_BIN" ]; then
    echo "استفاده از $BROWSER_BIN در حالت app" >> "$LOGFILE"
    "$BROWSER_BIN" \
        --app="$FRONTEND_URL" \
        --user-data-dir="$PROFILE_DIR" \
        --window-size=1280,860 \
        --no-first-run \
        --no-default-browser-check \
        >> "$LOGFILE" 2>&1 &
else
    echo "مرورگر کروم/کرومیوم پیدا نشد، استفاده از مرورگر پیش‌فرض" >> "$LOGFILE"
    xdg-open "$FRONTEND_URL" >> "$LOGFILE" 2>&1 &
fi

notify-send "PyTrack" "برنامه آماده است." 2>/dev/null || true