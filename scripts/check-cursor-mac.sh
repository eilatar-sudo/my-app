#!/usr/bin/env bash
# macOS: verify network and Cursor.app in /Applications; offer download if missing.
set -euo pipefail

# Check internet connection
if ! ping -c 1 github.com &>/dev/null; then
  echo "❌ No internet connection detected!"
  echo "Please connect to WiFi and run this script again."
  exit 1
fi
echo "✅ Connected to internet."

# Check if Cursor is installed
if [ -d "/Applications/Cursor.app" ]; then
  echo "✅ Cursor is installed."
else
  echo "❌ Cursor not found!"

  # Detect Mac architecture
  ARCH=$(uname -m)
  if [ "$ARCH" = "arm64" ]; then
    echo "Detected: Apple Silicon (M1/M2/M3)"
    CURSOR_URL="https://downloader.cursor.sh/builds/latest/mac/arm64/Cursor.dmg"
  else
    echo "Detected: Intel Mac"
    CURSOR_URL="https://downloader.cursor.sh/builds/latest/mac/x64/Cursor.dmg"
  fi

  echo "👉 Opening download page..."
  open "$CURSOR_URL"
  echo ""
  echo "STOP! DO THIS NOW:"
  echo "1. Download will start automatically."
  echo "2. Open the .dmg file and drag Cursor to Applications."
  echo "3. Launch Cursor once to complete installation."
  read -r -p "👉 Press [Enter] once Cursor is in Applications folder..."

  # Verify installation
  if [ ! -d "/Applications/Cursor.app" ]; then
    echo "❌ Cursor still not found in Applications!"
    echo "Please complete the installation and run this script again."
    exit 1
  fi
  echo "✅ Cursor installation confirmed!"
fi
