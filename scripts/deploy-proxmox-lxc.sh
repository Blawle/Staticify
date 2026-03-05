#!/bin/bash
#
# Staticify - Proxmox LXC Container Deployment Script
# Repository: https://github.com/Blawle/Staticify
#
# This script creates a lightweight LXC container (NOT a VM) on Proxmox
# and deploys the complete Staticify application stack.
#
# Usage: ./deploy-proxmox-lxc.sh [OPTIONS]
#
# Options:
#   --ctid <id>          Container ID (default: auto-detect next available)
#   --hostname <name>    Hostname (default: staticify)
#   --memory <mb>        Memory in MB (default: 2048)
#   --cores <n>          CPU cores (default: 2)
#   --storage <name>     Storage pool (default: local-lvm)
#   --disk <gb>          Disk size in GB (default: 20)
#   --bridge <name>      Network bridge (default: vmbr0)
#   --ip <address>       Static IP with CIDR (default: dhcp)
#   --gateway <address>  Gateway IP (required if static IP)
#   --template <path>    Template path (default: auto-download Ubuntu 22.04)
#   --domain <domain>    Domain name for SSL (optional)
#   --encryption-key <k> Custom encryption key (default: auto-generate)
#   --help               Show this help message
#
# Example:
#   ./deploy-proxmox-lxc.sh --hostname staticify --memory 4096 --cores 4
#   ./deploy-proxmox-lxc.sh --ip 192.168.1.100/24 --gateway 192.168.1.1
#

set -e

# Repository URL
REPO_URL="https://github.com/Blawle/Staticify.git"
REPO_RAW="https://raw.githubusercontent.com/Blawle/Staticify/main"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default values
CTID=""
HOSTNAME="staticify"
MEMORY=2048
SWAP=512
CORES=2
STORAGE="local-lvm"
DISK_SIZE=20
BRIDGE="vmbr0"
IP_CONFIG="ip=dhcp"
TEMPLATE=""
DOMAIN=""
ENCRYPTION_KEY=""

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# Banner
show_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║   ███████╗████████╗ █████╗ ████████╗██╗ ██████╗██╗███████╗  ║"
    echo "║   ██╔════╝╚══██╔══╝██╔══██╗╚══██╔══╝██║██╔════╝██║██╔════╝  ║"
    echo "║   ███████╗   ██║   ███████║   ██║   ██║██║     ██║█████╗    ║"
    echo "║   ╚════██║   ██║   ██╔══██║   ██║   ██║██║     ██║██╔══╝    ║"
    echo "║   ███████║   ██║   ██║  ██║   ██║   ██║╚██████╗██║██║       ║"
    echo "║   ╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ╚═╝ ╚═════╝╚═╝╚═╝       ║"
    echo "║                                                           ║"
    echo "║   WordPress to Static Site Deployer                       ║"
    echo "║   Proxmox LXC Container Deployment                        ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo "Repository: https://github.com/Blawle/Staticify"
    echo ""
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --ctid) CTID="$2"; shift 2 ;;
            --hostname) HOSTNAME="$2"; shift 2 ;;
            --memory) MEMORY="$2"; shift 2 ;;
            --cores) CORES="$2"; shift 2 ;;
            --storage) STORAGE="$2"; shift 2 ;;
            --disk) DISK_SIZE="$2"; shift 2 ;;
            --bridge) BRIDGE="$2"; shift 2 ;;
            --ip) IP_CONFIG="ip=$2"; shift 2 ;;
            --gateway) IP_CONFIG="${IP_CONFIG},gw=$2"; shift 2 ;;
            --template) TEMPLATE="$2"; shift 2 ;;
            --domain) DOMAIN="$2"; shift 2 ;;
            --encryption-key) ENCRYPTION_KEY="$2"; shift 2 ;;
            --help) head -35 "$0" | tail -30; exit 0 ;;
            *) log_error "Unknown option: $1. Use --help for usage." ;;
        esac
    done
}

# Check if running on Proxmox
check_proxmox() {
    log_step "Checking Proxmox environment..."
    if ! command -v pct &> /dev/null; then
        log_error "This script must be run on a Proxmox VE host (pct command not found)"
    fi
    if ! command -v pvesh &> /dev/null; then
        log_error "Proxmox API tools not found"
    fi
    log_success "Running on Proxmox VE"
}

# Get next available container ID
get_next_ctid() {
    if [ -z "$CTID" ]; then
        CTID=$(pvesh get /cluster/nextid)
    fi
    log_info "Container ID: $CTID"
}

# Download Ubuntu template if not available
download_template() {
    log_step "Preparing container template..."
    if [ -z "$TEMPLATE" ]; then
        TEMPLATE_NAME="ubuntu-22.04-standard_22.04-1_amd64.tar.zst"
        
        # Update template list
        pveam update >/dev/null 2>&1 || true
        
        # Check if template exists
        if ! pveam list local 2>/dev/null | grep -q "$TEMPLATE_NAME"; then
            log_info "Downloading Ubuntu 22.04 template..."
            pveam download local $TEMPLATE_NAME
        fi
        
        TEMPLATE="local:vztmpl/$TEMPLATE_NAME"
    fi
    log_success "Template ready: $TEMPLATE"
}

# Generate encryption key
generate_encryption_key() {
    if [ -z "$ENCRYPTION_KEY" ]; then
        ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
    fi
}

# Create LXC container
create_container() {
    log_step "Creating LXC container..."
    
    # Check if container already exists
    if pct status $CTID &>/dev/null; then
        log_error "Container $CTID already exists. Use a different --ctid or remove the existing container."
    fi
    
    pct create $CTID $TEMPLATE \
        --hostname $HOSTNAME \
        --memory $MEMORY \
        --swap $SWAP \
        --cores $CORES \
        --rootfs ${STORAGE}:${DISK_SIZE} \
        --net0 name=eth0,bridge=${BRIDGE},${IP_CONFIG} \
        --unprivileged 1 \
        --features nesting=1 \
        --onboot 1 \
        --start 0
    
    log_success "LXC container $CTID created"
}

# Start container
start_container() {
    log_step "Starting container..."
    pct start $CTID
    
    # Wait for container to be ready
    log_info "Waiting for container to initialize..."
    sleep 5
    
    # Wait for network
    for i in {1..30}; do
        if pct exec $CTID -- ping -c 1 8.8.8.8 &>/dev/null; then
            break
        fi
        sleep 1
    done
    
    log_success "Container started and network ready"
}

# Execute command in container
ct_exec() {
    pct exec $CTID -- bash -c "$1"
}

# Install system packages
install_packages() {
    log_step "Installing system packages..."
    
    ct_exec "apt update && DEBIAN_FRONTEND=noninteractive apt upgrade -y"
    
    ct_exec "DEBIAN_FRONTEND=noninteractive apt install -y \
        curl wget git nginx python3 python3-pip python3-venv \
        gnupg ca-certificates ufw software-properties-common"
    
    log_success "Base packages installed"
    
    # Install Node.js 20
    log_info "Installing Node.js 20..."
    ct_exec "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
    ct_exec "DEBIAN_FRONTEND=noninteractive apt install -y nodejs"
    ct_exec "npm install -g yarn"
    log_success "Node.js installed"
    
    # Install MongoDB 7.0
    log_info "Installing MongoDB 7.0..."
    ct_exec "curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor"
    ct_exec "echo 'deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse' | tee /etc/apt/sources.list.d/mongodb-org-7.0.list"
    ct_exec "apt update && DEBIAN_FRONTEND=noninteractive apt install -y mongodb-org"
    ct_exec "systemctl enable mongod && systemctl start mongod"
    log_success "MongoDB installed"
}

# Setup application
setup_application() {
    log_step "Setting up Staticify application..."
    
    # Create user
    ct_exec "id staticify &>/dev/null || useradd -m -s /bin/bash staticify"
    
    # Clone repository
    log_info "Cloning repository from GitHub..."
    ct_exec "rm -rf /opt/staticify"
    ct_exec "git clone ${REPO_URL} /opt/staticify"
    ct_exec "chown -R staticify:staticify /opt/staticify"
    
    log_success "Repository cloned"
}

# Setup backend
setup_backend() {
    log_step "Setting up backend..."
    
    # Create virtual environment and install dependencies
    ct_exec "cd /opt/staticify/backend && sudo -u staticify python3 -m venv venv"
    ct_exec "cd /opt/staticify/backend && sudo -u staticify bash -c 'source venv/bin/activate && pip install --upgrade pip'"
    ct_exec "cd /opt/staticify/backend && sudo -u staticify bash -c 'source venv/bin/activate && pip install -r requirements.txt'" || {
        # Fallback: install packages manually if requirements.txt doesn't exist
        ct_exec "cd /opt/staticify/backend && sudo -u staticify bash -c 'source venv/bin/activate && pip install \
            fastapi uvicorn motor pymongo python-dotenv pydantic \
            beautifulsoup4 lxml paramiko apscheduler aiofiles cryptography requests'"
    }
    
    # Create .env file
    ct_exec "cat > /opt/staticify/backend/.env << EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=staticify
CORS_ORIGINS=*
ENCRYPTION_KEY=${ENCRYPTION_KEY}
EOF"
    
    ct_exec "chmod 600 /opt/staticify/backend/.env"
    ct_exec "chown staticify:staticify /opt/staticify/backend/.env"
    
    log_success "Backend configured"
}

# Build frontend
build_frontend() {
    log_step "Building frontend..."
    
    ct_exec "cd /opt/staticify/frontend && sudo -u staticify yarn install"
    ct_exec "cd /opt/staticify/frontend && sudo -u staticify bash -c 'echo \"REACT_APP_BACKEND_URL=\" > .env.production'"
    ct_exec "cd /opt/staticify/frontend && sudo -u staticify yarn build"
    
    log_success "Frontend built"
}

# Configure systemd
configure_systemd() {
    log_step "Configuring systemd service..."
    
    ct_exec "cat > /etc/systemd/system/staticify.service << 'EOF'
[Unit]
Description=Staticify - WordPress to Static Deployer
After=network.target mongod.service
Wants=mongod.service

[Service]
Type=simple
User=staticify
Group=staticify
WorkingDirectory=/opt/staticify/backend
Environment=\"PATH=/opt/staticify/backend/venv/bin\"
ExecStart=/opt/staticify/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF"
    
    ct_exec "systemctl daemon-reload"
    ct_exec "systemctl enable staticify"
    ct_exec "systemctl start staticify"
    
    log_success "Systemd service configured"
}

# Configure Nginx
configure_nginx() {
    log_step "Configuring Nginx..."
    
    ct_exec "cat > /etc/nginx/sites-available/staticify << 'NGINXEOF'
server {
    listen 80;
    server_name _;
    
    root /opt/staticify/frontend/build;
    index index.html;
    
    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # Frontend SPA routing
    location / {
        try_files \$uri \$uri/ /index.html;
    }
    
    # Security headers
    add_header X-Frame-Options \"SAMEORIGIN\" always;
    add_header X-Content-Type-Options \"nosniff\" always;
    add_header X-XSS-Protection \"1; mode=block\" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml;
}
NGINXEOF"
    
    ct_exec "ln -sf /etc/nginx/sites-available/staticify /etc/nginx/sites-enabled/"
    ct_exec "rm -f /etc/nginx/sites-enabled/default"
    ct_exec "nginx -t && systemctl reload nginx"
    
    log_success "Nginx configured"
}

# Configure firewall
configure_firewall() {
    log_step "Configuring firewall..."
    
    ct_exec "ufw --force reset >/dev/null 2>&1"
    ct_exec "ufw default deny incoming"
    ct_exec "ufw default allow outgoing"
    ct_exec "ufw allow 22/tcp"
    ct_exec "ufw allow 80/tcp"
    ct_exec "ufw allow 443/tcp"
    ct_exec "ufw --force enable"
    
    log_success "Firewall configured"
}

# Setup SSL
setup_ssl() {
    if [ -n "$DOMAIN" ]; then
        log_step "Setting up SSL for $DOMAIN..."
        
        # Update Nginx server_name
        ct_exec "sed -i 's/server_name _;/server_name $DOMAIN;/' /etc/nginx/sites-available/staticify"
        ct_exec "nginx -t && systemctl reload nginx"
        
        # Install certbot and get certificate
        ct_exec "DEBIAN_FRONTEND=noninteractive apt install -y certbot python3-certbot-nginx"
        ct_exec "certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN" || {
            log_warning "SSL setup failed. You can run it manually later with: certbot --nginx -d $DOMAIN"
        }
        
        log_success "SSL configured"
    fi
}

# Verify installation
verify_installation() {
    log_step "Verifying installation..."
    
    # Check services
    ct_exec "systemctl is-active staticify" || log_warning "Backend service not running"
    ct_exec "systemctl is-active mongod" || log_warning "MongoDB not running"
    ct_exec "systemctl is-active nginx" || log_warning "Nginx not running"
    
    # Test API
    sleep 2
    ct_exec "curl -sf http://localhost:8001/api/ >/dev/null" && log_success "API responding" || log_warning "API not responding yet"
}

# Show completion message
show_completion() {
    # Get container IP
    sleep 2
    CONTAINER_IP=$(pct exec $CTID -- hostname -I 2>/dev/null | awk '{print $1}')
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║             DEPLOYMENT COMPLETE!                          ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Container Details:${NC}"
    echo -e "  Container ID:   ${GREEN}$CTID${NC}"
    echo -e "  Hostname:       ${GREEN}$HOSTNAME${NC}"
    echo -e "  IP Address:     ${GREEN}${CONTAINER_IP:-DHCP}${NC}"
    echo -e "  Memory:         ${GREEN}${MEMORY}MB${NC}"
    echo -e "  CPU Cores:      ${GREEN}$CORES${NC}"
    echo ""
    echo -e "${CYAN}Access URLs:${NC}"
    echo -e "  Web UI:         ${GREEN}http://${CONTAINER_IP:-<container-ip>}${NC}"
    [ -n "$DOMAIN" ] && echo -e "  Domain:         ${GREEN}https://$DOMAIN${NC}"
    echo ""
    echo -e "${YELLOW}IMPORTANT - Save this encryption key:${NC}"
    echo -e "  ${RED}$ENCRYPTION_KEY${NC}"
    echo ""
    echo -e "${CYAN}Management Commands:${NC}"
    echo -e "  Enter container: ${GREEN}pct enter $CTID${NC}"
    echo -e "  View logs:       ${GREEN}pct exec $CTID -- journalctl -u staticify -f${NC}"
    echo -e "  Restart app:     ${GREEN}pct exec $CTID -- systemctl restart staticify${NC}"
    echo ""
    echo -e "${CYAN}Repository:${NC} https://github.com/Blawle/Staticify"
    echo ""
}

# Main function
main() {
    show_banner
    parse_args "$@"
    
    check_proxmox
    get_next_ctid
    download_template
    generate_encryption_key
    
    create_container
    start_container
    install_packages
    setup_application
    setup_backend
    build_frontend
    configure_systemd
    configure_nginx
    configure_firewall
    setup_ssl
    verify_installation
    
    show_completion
}

# Run
main "$@"
