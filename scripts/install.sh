#!/bin/bash
#
# Staticify - Standalone Installation Script
# Repository: https://github.com/Blawle/Staticify
#
# This script installs Staticify on any Ubuntu/Debian system,
# including inside an existing LXC container.
#
# Usage: sudo ./install.sh [OPTIONS]
#
# Options:
#   --domain <domain>        Domain name for SSL (optional)
#   --encryption-key <key>   Custom encryption key (default: auto-generate)
#   --skip-ssl               Skip SSL setup
#   --help                   Show this help message
#

set -e

# Repository
REPO_URL="https://github.com/Blawle/Staticify.git"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Variables
DOMAIN=""
ENCRYPTION_KEY=""
SKIP_SSL=false
APP_DIR="/opt/staticify"
APP_USER="staticify"

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# Banner
show_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════╗"
    echo "║   STATICIFY - Standalone Installation     ║"
    echo "║   WordPress to Static Site Deployer       ║"
    echo "╚═══════════════════════════════════════════╝"
    echo -e "${NC}"
    echo "Repository: https://github.com/Blawle/Staticify"
    echo ""
}

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
    log_error "Please run as root: sudo $0"
fi

# Check OS
check_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
            log_warning "This script is designed for Ubuntu/Debian. Your OS: $ID"
            read -p "Continue anyway? (y/N) " -n 1 -r
            echo
            [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
        fi
    fi
}

show_banner
check_os

log_step "Starting Staticify installation..."

# Generate encryption key
if [ -z "$ENCRYPTION_KEY" ]; then
    ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
    log_info "Generated encryption key"
fi

# Update system
log_step "Updating system packages..."
apt update && DEBIAN_FRONTEND=noninteractive apt upgrade -y

# Install dependencies
log_step "Installing dependencies..."
DEBIAN_FRONTEND=noninteractive apt install -y \
    curl wget git nginx python3 python3-pip python3-venv \
    gnupg ca-certificates ufw software-properties-common

# Install Node.js
log_step "Installing Node.js 20..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 18 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    DEBIAN_FRONTEND=noninteractive apt install -y nodejs
fi
npm install -g yarn
log_success "Node.js $(node -v) installed"

# Install MongoDB
log_step "Installing MongoDB 7.0..."
if ! command -v mongod &> /dev/null; then
    curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
        gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
    
    . /etc/os-release
    case "$ID" in
        ubuntu) CODENAME="${VERSION_CODENAME:-jammy}" ;;
        debian) CODENAME="${VERSION_CODENAME:-bookworm}" ;;
        *) CODENAME="jammy" ;;
    esac
    
    echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/${ID} ${CODENAME}/mongodb-org/7.0 multiverse" | \
        tee /etc/apt/sources.list.d/mongodb-org-7.0.list
    
    apt update
    DEBIAN_FRONTEND=noninteractive apt install -y mongodb-org
fi
systemctl enable mongod
systemctl start mongod
log_success "MongoDB installed"

# Create user
log_step "Creating application user..."
id $APP_USER &>/dev/null || useradd -m -s /bin/bash $APP_USER
log_success "User '$APP_USER' ready"

# Clone repository
log_step "Cloning Staticify repository..."
rm -rf $APP_DIR
git clone $REPO_URL $APP_DIR
chown -R $APP_USER:$APP_USER $APP_DIR
log_success "Repository cloned to $APP_DIR"

# Setup backend
log_step "Setting up backend..."
cd $APP_DIR/backend

sudo -u $APP_USER python3 -m venv venv
sudo -u $APP_USER bash -c "source venv/bin/activate && pip install --upgrade pip"

if [ -f requirements.txt ]; then
    sudo -u $APP_USER bash -c "source venv/bin/activate && pip install -r requirements.txt"
else
    sudo -u $APP_USER bash -c "source venv/bin/activate && pip install \
        fastapi uvicorn motor pymongo python-dotenv pydantic \
        beautifulsoup4 lxml paramiko apscheduler aiofiles cryptography requests"
fi

# Create .env
cat > $APP_DIR/backend/.env << EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=staticify
CORS_ORIGINS=*
ENCRYPTION_KEY=${ENCRYPTION_KEY}
EOF
chmod 600 $APP_DIR/backend/.env
chown $APP_USER:$APP_USER $APP_DIR/backend/.env
log_success "Backend configured"

# Build frontend
log_step "Building frontend..."
cd $APP_DIR/frontend
sudo -u $APP_USER yarn install
sudo -u $APP_USER bash -c 'echo "REACT_APP_BACKEND_URL=" > .env.production'
sudo -u $APP_USER yarn build
log_success "Frontend built"

# Create systemd service
log_step "Creating systemd service..."
cat > /etc/systemd/system/staticify.service << EOF
[Unit]
Description=Staticify - WordPress to Static Deployer
After=network.target mongod.service
Wants=mongod.service

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
systemctl enable staticify
systemctl start staticify
log_success "Systemd service created"

# Configure Nginx
log_step "Configuring Nginx..."
cat > /etc/nginx/sites-available/staticify << 'EOF'
server {
    listen 80;
    server_name _;
    
    root /opt/staticify/frontend/build;
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
    
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
}
EOF

ln -sf /etc/nginx/sites-available/staticify /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
log_success "Nginx configured"

# Configure firewall
log_step "Configuring firewall..."
ufw --force reset >/dev/null 2>&1
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
log_success "Firewall configured"

# SSL setup
if [ -n "$DOMAIN" ] && [ "$SKIP_SSL" = false ]; then
    log_step "Setting up SSL for $DOMAIN..."
    sed -i "s/server_name _;/server_name $DOMAIN;/" /etc/nginx/sites-available/staticify
    nginx -t && systemctl reload nginx
    
    DEBIAN_FRONTEND=noninteractive apt install -y certbot python3-certbot-nginx
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN || {
        log_warning "SSL setup failed. Run manually: certbot --nginx -d $DOMAIN"
    }
fi

# Verify
log_step "Verifying installation..."
sleep 2
systemctl is-active staticify >/dev/null && log_success "Backend service running" || log_warning "Backend not running"
systemctl is-active mongod >/dev/null && log_success "MongoDB running" || log_warning "MongoDB not running"
curl -sf http://localhost:8001/api/ >/dev/null && log_success "API responding" || log_warning "API not responding"

# Get IP
SERVER_IP=$(hostname -I | awk '{print $1}')

# Completion message
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       INSTALLATION COMPLETE!              ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Access URL:${NC}  ${GREEN}http://$SERVER_IP${NC}"
[ -n "$DOMAIN" ] && echo -e "${CYAN}Domain:${NC}      ${GREEN}https://$DOMAIN${NC}"
echo ""
echo -e "${YELLOW}SAVE THIS ENCRYPTION KEY:${NC}"
echo -e "${RED}$ENCRYPTION_KEY${NC}"
echo ""
echo -e "${CYAN}Commands:${NC}"
echo -e "  View logs:    ${GREEN}journalctl -u staticify -f${NC}"
echo -e "  Restart:      ${GREEN}systemctl restart staticify${NC}"
echo -e "  Update:       ${GREEN}cd $APP_DIR && git pull && systemctl restart staticify${NC}"
echo ""
echo -e "${CYAN}Repository:${NC} https://github.com/Blawle/Staticify"
echo ""
