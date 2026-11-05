#!/system/bin/sh
# ==============================================================================
# SGIS Booth Mobile Server & 5G Tunnel Service for Android (Motorola Edge 70 Max)
# ==============================================================================

SGIS_DIR="/data/local/tmp/sgis"
BIN="$SGIS_DIR/sgis-server"
WEB_DIR="$SGIS_DIR/web"
DATA_DIR="$SGIS_DIR/data"
SDCARD_DIR="/sdcard/SGIS_Responses"
SERVER_LOG="/data/local/tmp/sgis_server.log"
SERVER_PID_FILE="/data/local/tmp/sgis_server.pid"

ROOTFS="/data/adb/cloudflared/rootfs"
TUNNEL_LOG="/data/local/tmp/cloudflared_sgis.log"
TUNNEL_PID_FILE="/data/local/tmp/cloudflared_sgis.pid"
URL_FILE="/data/local/tmp/sgis_tunnel_url.txt"
SDCARD_URL_FILE="$SDCARD_DIR/TUNNEL_URL.txt"

PORT=8888
TARGET_URL="http://127.0.0.1:$PORT"
TAILSCALE_IP="100.107.210.29"

init_env() {
    mkdir -p "$SGIS_DIR" "$WEB_DIR" "$DATA_DIR" "$SDCARD_DIR"
    chmod 755 "$BIN" 2>/dev/null || true

    # Prepare Cloudflare chroot rootfs
    mkdir -p "$ROOTFS/etc/ssl/certs" "$ROOTFS/bin" "$ROOTFS/tmp" "$ROOTFS/dev"
    if [ -f "/data/adb/bin/cloudflared" ]; then
        cp /data/adb/bin/cloudflared "$ROOTFS/bin/cloudflared"
    elif [ -f "/data/local/tmp/cloudflared" ]; then
        cp /data/local/tmp/cloudflared "$ROOTFS/bin/cloudflared"
    fi
    chmod 755 "$ROOTFS/bin/cloudflared" 2>/dev/null || true

    # Bind mount /dev if not already mounted
    if ! mount | grep -q "$ROOTFS/dev"; then
        mount -o bind /dev "$ROOTFS/dev" 2>/dev/null || true
    fi

    # Set up carrier-compatible DNS (LG U+ cellular + Cloudflare fallbacks)
    printf "nameserver 106.101.252.4\nnameserver 211.36.129.4\nnameserver 1.1.1.1\n" > "$ROOTFS/etc/resolv.conf"
    printf "127.0.0.1 localhost\n::1 localhost\n" > "$ROOTFS/etc/hosts"
}

get_url() {
    if [ -f "$URL_FILE" ]; then
        cat "$URL_FILE"
    elif [ -f "$TUNNEL_LOG" ]; then
        grep -o https://[-a-zA-Z0-9.]*.trycloudflare.com "$TUNNEL_LOG" 2>/dev/null | head -n 1
    fi
}

start() {
    echo "=========================================================="
    echo " [SGIS Mobile Event] Starting Server on Motorola Edge 70 Max..."
    echo "=========================================================="
    init_env

    # 1. Start Go Web Server
    if pgrep -f "$BIN" >/dev/null; then
        echo "sgis-server is already running."
    else
        echo "Starting sgis-server on port $PORT..."
        rm -f "$SERVER_LOG"
        nohup "$BIN" -port "$PORT" -web "$WEB_DIR" -data "$DATA_DIR" -sdcard "$SDCARD_DIR" > "$SERVER_LOG" 2>&1 &
        SERVER_PID=$!
        echo "$SERVER_PID" > "$SERVER_PID_FILE"
        sleep 1
    fi

    # 2. Start Cloudflare Tunnel
    pkill -f "cloudflared tunnel.*$PORT" 2>/dev/null || true
    rm -f "$TUNNEL_LOG" "$URL_FILE"

    echo "Starting Cloudflare 5G quick tunnel..."
    nohup chroot "$ROOTFS" /bin/cloudflared tunnel --no-autoupdate --url "$TARGET_URL" > "$TUNNEL_LOG" 2>&1 &
    TUNNEL_PID=$!
    echo "$TUNNEL_PID" > "$TUNNEL_PID_FILE"

    echo "Waiting for public HTTPS tunnel URL (mobile 5G)..."
    PUB_URL=""
    for i in $(seq 1 20); do
        sleep 1
        PUB_URL=$(grep -o https://[-a-zA-Z0-9.]*.trycloudflare.com "$TUNNEL_LOG" 2>/dev/null | head -n 1)
        if [ -n "$PUB_URL" ]; then
            echo "$PUB_URL" > "$URL_FILE"
            echo "$PUB_URL" > "$SDCARD_URL_FILE"
            break
        fi
    done

    # 3. Protect from Android Low Memory Killer (LMK) and acquire wake lock
    echo sgis_server > /sys/power/wake_lock 2>/dev/null || true
    for p in $(pgrep -f "$BIN") $(pgrep -f "cloudflared"); do
        echo -950 > "/proc/$p/oom_score_adj" 2>/dev/null || true
    done

    echo ""
    echo "=========================================================="
    echo " 🎉 SGIS Booth Mobile Server is LIVE on Android!"
    echo "=========================================================="
    if [ -n "$PUB_URL" ]; then
        echo " 🌐 [Public 5G URL]      : $PUB_URL"
        echo " 📋 [Admin Dashboard]    : $PUB_URL/admin.html"
        echo " 📥 [CSV Direct Export]  : $PUB_URL/api/export/csv"
    else
        echo " ⚠️ Tunnel URL still registering. Run '$0 url' in a few seconds."
    fi
    echo " 📶 [Tailscale Direct]   : http://$TAILSCALE_IP:$PORT"
    echo " 📱 [Local Device]       : http://localhost:$PORT"
    echo " 💾 [SDCard Excel CSV]   : $SDCARD_DIR/sgis_quiz_responses.csv"
    echo " 🛡️ [LMK / Keepalive]    : oom_score_adj=-950, wakelock active"
    echo "=========================================================="
}

stop() {
    echo "Stopping SGIS Booth Mobile Server & Tunnel..."
    pkill -f "$BIN" 2>/dev/null || true
    pkill -f "cloudflared tunnel.*$PORT" 2>/dev/null || true
    echo sgis_server > /sys/power/wake_unlock 2>/dev/null || true
    rm -f "$SERVER_PID_FILE" "$TUNNEL_PID_FILE" "$URL_FILE"
    echo "Stopped."
}

status() {
    echo "=== SGIS Booth Android Service Status ==="
    SERVER_PID=$(pgrep -f "$BIN" 2>/dev/null | head -n 1)
    if [ -n "$SERVER_PID" ]; then
        echo "Server Process   : RUNNING (PID $SERVER_PID)"
    else
        echo "Server Process   : STOPPED"
    fi

    TUNNEL_PID=$(pgrep -f "cloudflared" 2>/dev/null | head -n 1)
    if [ -n "$TUNNEL_PID" ]; then
        echo "Cloudflare Tunnel: RUNNING (PID $TUNNEL_PID)"
        URL=$(get_url)
        echo "Public URL       : $URL"
    else
        echo "Cloudflare Tunnel: STOPPED"
    fi

    echo "Tailscale IP     : $TAILSCALE_IP"
    if [ -f "$SDCARD_DIR/sgis_quiz_responses.csv" ]; then
        COUNT=$(wc -l < "$SDCARD_DIR/sgis_quiz_responses.csv" 2>/dev/null || echo 1)
        echo "Stored Responses : $((COUNT - 1)) items on SDCard"
    fi
}

case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        stop
        sleep 1
        start
        ;;
    status)
        status
        ;;
    url)
        get_url
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|url}"
        exit 1
        ;;
esac
