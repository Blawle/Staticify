#!/bin/bash
#
# WordPress to Static Deployer - Proxmox LXC Deployment Script
# 
# This script creates and configures an LXC container on Proxmox
# with the complete WP Static Deployer application stack.
#
# Usage: ./deploy-proxmox-lxc.sh [OPTIONS]
#
# Options:
#   --ctid <id>          Container ID (default: auto-detect next available)
#   --hostname <name>    Hostname (default: wp-static-deployer)
#   --memory <mb>        Memory in MB (default: 2048)
#   --cores <n>          CPU cores (default: 2)
#   --storage <name>     Storage pool (default: local-lvm)
#   --disk <gb>          Disk size in GB (default: 20)
#   --bridge <name>      Network bridge (default: vmbr0)
#   --ip <address>       Static IP (default: dhcp)
#   --gateway <address>  Gateway IP (required if static IP)
#   --template <path>    Template path (default: auto-download Ubuntu 22.04)
#   --domain <domain>    Domain name for SSL (optional)
#   --encryption-key <k> Custom encryption key (default: auto-generate)
#   --help               Show this help message
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
CTID=""
HOSTNAME="wp-static-deployer"
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
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --ctid)
                CTID="$2"
                shift 2
                ;;
            --hostname)
                HOSTNAME="$2"
                shift 2
                ;;
            --memory)
                MEMORY="$2"
                shift 2
                ;;
            --cores)
                CORES="$2"
                shift 2
                ;;
            --storage)
                STORAGE="$2"
                shift 2
                ;;
            --disk)
                DISK_SIZE="$2"
                shift 2
                ;;
            --bridge)
                BRIDGE="$2"
                shift 2
                ;;
            --ip)
                IP_CONFIG="ip=$2"
                shift 2
                ;;
            --gateway)
                IP_CONFIG="${IP_CONFIG},gw=$2"
                shift 2
                ;;
            --template)
                TEMPLATE="$2"
                shift 2
                ;;
            --domain)
                DOMAIN="$2"
                shift 2
                ;;
            --encryption-key)
                ENCRYPTION_KEY="$2"
                shift 2
                ;;
            --help)
                head -30 "$0" | tail -25
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                ;;
        esac
    done
}

# Check if running on Proxmox
check_proxmox() {
    if ! command -v pct &> /dev/null; then
        log_error "This script must be run on a Proxmox host"
    fi
    log_success "Running on Proxmox"
}

# Get next available container ID
get_next_ctid() {
    if [ -z "$CTID" ]; then
        CTID=$(pvesh get /cluster/nextid)
        log_info "Using container ID: $CTID"
    fi
}

# Download template if not specified
download_template() {
    if [ -z "$TEMPLATE" ]; then
        log_info "Downloading Ubuntu 22.04 template..."
        pveam update
        TEMPLATE_NAME="ubuntu-22.04-standard_22.04-1_amd64.tar.zst"
        
        if ! pveam list local | grep -q "$TEMPLATE_NAME"; then
            pveam download local $TEMPLATE_NAME
        fi
        
        TEMPLATE="local:vztmpl/$TEMPLATE_NAME"
        log_success "Template ready: $TEMPLATE"
    fi
}

# Generate encryption key if not provided
generate_encryption_key() {
    if [ -z "$ENCRYPTION_KEY" ]; then
        ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
        log_info "Generated encryption key (save this!): $ENCRYPTION_KEY"
    fi
}

# Create LXC container
create_container() {
    log_info "Creating LXC container $CTID..."
    
    pct create $CTID $TEMPLATE \
        --hostname $HOSTNAME \
        --memory $MEMORY \
        --swap $SWAP \
        --cores $CORES \
        --rootfs ${STORAGE}:${DISK_SIZE} \
        --net0 name=eth0,bridge=${BRIDGE},${IP_CONFIG} \
        --unprivileged 1 \
        --features nesting=1 \
        --onboot 1
    
    log_success "Container created"
}

# Start container
start_container() {
    log_info "Starting container..."
    pct start $CTID
    sleep 5
    log_success "Container started"
}

# Execute command in container
ct_exec() {
    pct exec $CTID -- bash -c "$1"
}

# Install system packages
install_packages() {
    log_info "Installing system packages..."
    
    ct_exec "apt update && apt upgrade -y"
    
    ct_exec "apt install -y \
        curl \
        wget \
        git \
        nginx \
        python3 \
        python3-pip \
        python3-venv \
        gnupg \
        ca-certificates \
        ufw"
    
    # Install Node.js 20
    ct_exec "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
    ct_exec "apt install -y nodejs"
    ct_exec "npm install -g yarn"
    
    # Install MongoDB 7.0
    ct_exec "curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor"
    ct_exec "echo 'deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse' | tee /etc/apt/sources.list.d/mongodb-org-7.0.list"
    ct_exec "apt update && apt install -y mongodb-org"
    ct_exec "systemctl enable mongod && systemctl start mongod"
    
    log_success "Packages installed"
}

# Create application user and directories
setup_app_user() {
    log_info "Setting up application user..."
    
    ct_exec "useradd -m -s /bin/bash wpstatic || true"
    ct_exec "mkdir -p /opt/wp-static-deployer/{backend,frontend}"
    ct_exec "chown -R wpstatic:wpstatic /opt/wp-static-deployer"
    
    log_success "Application user created"
}

# Deploy backend
deploy_backend() {
    log_info "Deploying backend..."
    
    # Create virtual environment
    ct_exec "su - wpstatic -c 'cd /opt/wp-static-deployer/backend && python3 -m venv venv'"
    
    # Install Python packages
    ct_exec "su - wpstatic -c 'cd /opt/wp-static-deployer/backend && source venv/bin/activate && pip install --upgrade pip'"
    ct_exec "su - wpstatic -c 'cd /opt/wp-static-deployer/backend && source venv/bin/activate && pip install \
        fastapi==0.110.1 \
        uvicorn==0.25.0 \
        motor==3.3.1 \
        pymongo==4.5.0 \
        python-dotenv \
        pydantic \
        beautifulsoup4 \
        lxml \
        paramiko \
        apscheduler \
        aiofiles \
        cryptography \
        requests'"
    
    # Create .env file
    ct_exec "cat > /opt/wp-static-deployer/backend/.env << 'ENVEOF'
MONGO_URL=mongodb://localhost:27017
DB_NAME=wp_static_deployer
CORS_ORIGINS=*
ENCRYPTION_KEY=${ENCRYPTION_KEY}
ENVEOF"
    
    ct_exec "chmod 600 /opt/wp-static-deployer/backend/.env"
    ct_exec "chown wpstatic:wpstatic /opt/wp-static-deployer/backend/.env"
    
    log_success "Backend deployed"
}

# Deploy backend source code
deploy_backend_source() {
    log_info "Deploying backend source code..."
    
    # Copy server.py to container
    # In production, you would copy from your source
    # For now, we'll create a placeholder that you need to replace
    
    pct push $CTID /app/backend/server.py /opt/wp-static-deployer/backend/server.py 2>/dev/null || {
        log_warning "Could not copy server.py - you'll need to copy it manually"
        ct_exec "touch /opt/wp-static-deployer/backend/server.py"
    }
    
    ct_exec "chown wpstatic:wpstatic /opt/wp-static-deployer/backend/server.py"
    
    log_success "Backend source deployed"
}

# Deploy frontend
deploy_frontend() {
    log_info "Deploying frontend..."
    
    # Copy built frontend files
    # In production, you would copy your build directory
    
    if [ -d "/app/frontend/build" ]; then
        pct push $CTID /app/frontend/build /opt/wp-static-deployer/frontend/build --recursive 2>/dev/null || {
            log_warning "Could not copy frontend build - you'll need to copy it manually"
        }
    else
        log_warning "Frontend build not found - you'll need to build and copy it manually"
        ct_exec "mkdir -p /opt/wp-static-deployer/frontend/build"
        ct_exec "echo '<html><body><h1>Frontend not deployed</h1><p>Copy your built frontend files to /opt/wp-static-deployer/frontend/build</p></body></html>' > /opt/wp-static-deployer/frontend/build/index.html"
    fi
    
    ct_exec "chown -R wpstatic:wpstatic /opt/wp-static-deployer/frontend"
    
    log_success "Frontend deployed"
}

# Configure systemd service
configure_systemd() {
    log_info "Configuring systemd service..."
    
    ct_exec "cat > /etc/systemd/system/wp-static-backend.service << 'SERVICEEOF'
[Unit]
Description=WP Static Deployer Backend
After=network.target mongod.service

[Service]
Type=simple
User=wpstatic
Group=wpstatic
WorkingDirectory=/opt/wp-static-deployer/backend
Environment=\"PATH=/opt/wp-static-deployer/backend/venv/bin\"
ExecStart=/opt/wp-static-deployer/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICEEOF"
    
    ct_exec "systemctl daemon-reload"
    ct_exec "systemctl enable wp-static-backend"
    
    log_success "Systemd service configured"
}

# Configure Nginx
configure_nginx() {
    log_info "Configuring Nginx..."
    
    ct_exec "cat > /etc/nginx/sites-available/wp-static-deployer << 'NGINXEOF'
server {
    listen 80;
    server_name _;
    
    root /opt/wp-static-deployer/frontend/build;
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
    
    # Frontend routing
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
    
    ct_exec "ln -sf /etc/nginx/sites-available/wp-static-deployer /etc/nginx/sites-enabled/"
    ct_exec "rm -f /etc/nginx/sites-enabled/default"
    ct_exec "nginx -t"
    ct_exec "systemctl reload nginx"
    
    log_success "Nginx configured"
}

# Configure firewall
configure_firewall() {
    log_info "Configuring firewall..."
    
    ct_exec "ufw --force reset"
    ct_exec "ufw default deny incoming"
    ct_exec "ufw default allow outgoing"
    ct_exec "ufw allow 22/tcp"
    ct_exec "ufw allow 80/tcp"
    ct_exec "ufw allow 443/tcp"
    ct_exec "ufw --force enable"
    
    log_success "Firewall configured"
}

# Start services
start_services() {
    log_info "Starting services..."
    
    ct_exec "systemctl start wp-static-backend || true"
    ct_exec "systemctl status wp-static-backend --no-pager || true"
    
    log_success "Services started"
}

# Setup SSL with Let's Encrypt
setup_ssl() {
    if [ -n "$DOMAIN" ]; then
        log_info "Setting up SSL for $DOMAIN..."
        
        ct_exec "apt install -y certbot python3-certbot-nginx"
        ct_exec "certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN || true"
        
        log_success "SSL configured"
    fi
}

# Get container IP
get_container_ip() {
    sleep 3
    CONTAINER_IP=$(pct exec $CTID -- hostname -I | awk '{print $1}')
    echo ""
    log_success "=========================================="
    log_success "Deployment Complete!"
    log_success "=========================================="
    echo ""
    echo -e "${GREEN}Container ID:${NC} $CTID"
    echo -e "${GREEN}Container IP:${NC} $CONTAINER_IP"
    echo -e "${GREEN}Access URL:${NC} http://$CONTAINER_IP"
    if [ -n "$DOMAIN" ]; then
        echo -e "${GREEN}Domain URL:${NC} https://$DOMAIN"
    fi
    echo ""
    echo -e "${YELLOW}Encryption Key (save this!):${NC}"
    echo "$ENCRYPTION_KEY"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "1. Copy your backend server.py to /opt/wp-static-deployer/backend/"
    echo "2. Copy your frontend build to /opt/wp-static-deployer/frontend/build/"
    echo "3. Restart services: pct exec $CTID -- systemctl restart wp-static-backend"
    echo "4. Test the application at http://$CONTAINER_IP"
    echo ""
    log_success "=========================================="
}

# Main function
main() {
    echo ""
    echo "=========================================="
    echo " WordPress to Static Deployer"
    echo " Proxmox LXC Deployment Script"
    echo "=========================================="
    echo ""
    
    parse_args "$@"
    check_proxmox
    get_next_ctid
    download_template
    generate_encryption_key
    create_container
    start_container
    install_packages
    setup_app_user
    deploy_backend
    deploy_backend_source
    deploy_frontend
    configure_systemd
    configure_nginx
    configure_firewall
    start_services
    setup_ssl
    get_container_ip
}

# Run main function
main "$@"
