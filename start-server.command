#!/bin/bash

# Change to the tuition-tracker directory
cd "$(dirname "$0")"

PORT=3004

# Kill any existing process on the port
EXISTING=$(lsof -ti :$PORT 2>/dev/null)
if [ -n "$EXISTING" ]; then
    echo "Stopping existing server on port $PORT..."
    kill -9 $EXISTING 2>/dev/null
    sleep 1
fi

echo "=========================================="
echo "  ICAN Tuition Tracker"
echo "=========================================="
echo ""

# Get local IP address
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "unknown")

echo "  This computer:  http://localhost:$PORT"
echo ""
echo "  Other computers: http://$IP:$PORT"
echo "  (same WiFi network)"
echo ""
echo "  Data is saved automatically."
echo "  Press Ctrl+C to stop the server."
echo "=========================================="
echo ""

# Start the server
node server.js

# Keep terminal open if there's an error
if [ $? -ne 0 ]; then
    echo ""
    echo "Error occurred. Press any key to close..."
    read -n 1
fi
