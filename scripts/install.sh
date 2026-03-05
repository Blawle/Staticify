#!/bin/bash
#
# WordPress to Static Deployer - Standalone Installation Script
# 
# This script installs the application on any Ubuntu/Debian system.
# Run as root or with sudo.
#
# Usage: sudo ./install.sh [OPTIONS]
#
# Options:
#   --domain <domain>        Domain name for SSL (optional)
#   --encryption-key <key>   Custom encryption key (default: auto-generate)
#   --skip-ssl              Skip SSL setup
#   --help                  Show this help message
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Variables
DOMAIN=""
ENCRYPTION_KEY=""
SKIP_SSL=false
APP_DIR="/opt/wp-static-deployer"
APP_USER="wpstatic"

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --domain) DOMAIN="$2"; shift 2 ;;
        --encryption-key) ENCRYPTION_KEY="$2"; shift 2 ;;
        --skip-ssl) SKIP_SSL=true; shift ;;
        --help) head -20 "$0" | tail -15; exit 0 ;;
        *) log_error "Unknown option: $1" ;;
    esac
done

# Check root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root or with sudo"
fi

# Check OS
if ! grep -q -E "Ubuntu|Debian" /etc/os-release; then
    log_warning "This script is designed for Ubuntu/Debian. Proceed with caution."
fi

log_info "Starting installation..."

# Generate encryption key
if [ -z "$ENCRYPTION_KEY" ]; then
    ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
    log_info "Generated encryption key: $ENCRYPTION_KEY"
fi

# Update system
log_info "Updating system packages..."
apt update && apt upgrade -y

# Install dependencies
log_info "Installing dependencies..."
apt install -y \
    curl wget git nginx \
    python3 python3-pip python3-venv \
    gnupg ca-certificates ufw

# Install Node.js
log_info "Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
npm install -g yarn

# Install MongoDB
log_info "Installing MongoDB..."
if ! command -v mongod &> /dev/null; then
    curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
        gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
    
    . /etc/os-release
    if [ "$ID" = "ubuntu" ]; then
        CODENAME="jammy"
    else
        CODENAME="bookworm"
    fi
    
    echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/${ID} ${CODENAME}/mongodb-org/7.0 main" | \
        tee /etc/apt/sources.list.d/mongodb-org-7.0.list
    
    apt update
    apt install -y mongodb-org
fi
systemctl enable mongod
systemctl start mongod

# Create user
log_info "Creating application user..."
id $APP_USER &>/dev/null || useradd -m -s /bin/bash $APP_USER

# Create directories
log_info "Setting up application directories..."
mkdir -p $APP_DIR/{backend,frontend/build}
chown -R $APP_USER:$APP_USER $APP_DIR

# Setup backend
log_info "Setting up backend..."
cd $APP_DIR/backend

sudo -u $APP_USER python3 -m venv venv
sudo -u $APP_USER bash -c "source venv/bin/activate && pip install --upgrade pip"
sudo -u $APP_USER bash -c "source venv/bin/activate && pip install \
    fastapi==0.110.1 uvicorn==0.25.0 motor==3.3.1 pymongo==4.5.0 \
    python-dotenv pydantic beautifulsoup4 lxml paramiko apscheduler \
    aiofiles cryptography requests"

# Create .env
cat > $APP_DIR/backend/.env << EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=wp_static_deployer
CORS_ORIGINS=*
ENCRYPTION_KEY=${ENCRYPTION_KEY}
EOF
chmod 600 $APP_DIR/backend/.env
chown $APP_USER:$APP_USER $APP_DIR/backend/.env

# Create systemd service
log_info "Creating systemd service..."
cat > /etc/systemd/system/wp-static-backend.service << EOF
[Unit]
Description=WP Static Deployer Backend
After=network.target mongod.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/backend
Environment="PATH=$APP_DIR/backend/venv/bin"
ExecStart=$APP_DIR/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable wp-static-backend

# Configure Nginx
log_info "Configuring Nginx..."
cat > /etc/nginx/sites-available/wp-static-deployer << 'EOF'
server {
    listen 80;
    server_name _;
    
    root /opt/wp-static-deployer/frontend/build;
    index index.html;
    
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
}
EOF

ln -sf /etc/nginx/sites-available/wp-static-deployer /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Configure firewall
log_info "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# SSL setup
if [ -n "$DOMAIN" ] && [ "$SKIP_SSL" = false ]; then
    log_info "Setting up SSL..."
    apt install -y certbot python3-certbot-nginx
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN || true
fi

# Final message
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
log_success "=========================================="
log_success "Installation Complete!"
log_success "=========================================="
echo ""
echo -e "${GREEN}Server IP:${NC} $SERVER_IP"
echo -e "${GREEN}Access URL:${NC} http://$SERVER_IP"
[ -n "$DOMAIN" ] && echo -e "${GREEN}Domain URL:${NC} https://$DOMAIN"
echo ""
echo -e "${YELLOW}Encryption Key (SAVE THIS!):${NC}"
echo "$ENCRYPTION_KEY"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Copy server.py to: $APP_DIR/backend/server.py"
echo "2. Copy frontend build to: $APP_DIR/frontend/build/"
echo "3. Start backend: systemctl start wp-static-backend"
echo "4. Test: curl http://localhost:8001/api/"
echo ""
log_success "=========================================="
