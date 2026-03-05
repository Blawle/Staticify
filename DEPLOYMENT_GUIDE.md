# WordPress to Static Deployer - Deployment Guide

## Overview

This guide covers deploying the WordPress to Static Deployer tool to a self-contained LXC container on a Proxmox host. The deployment includes:

- **Frontend**: React application (served via Nginx)
- **Backend**: FastAPI Python application (via Uvicorn + systemd)
- **Database**: MongoDB
- **Reverse Proxy**: Nginx

## System Requirements

### Minimum Requirements
- **CPU**: 2 cores
- **RAM**: 2GB (4GB recommended)
- **Storage**: 20GB
- **OS**: Ubuntu 22.04 LTS or Debian 12

### Network Requirements
- Port 80 (HTTP)
- Port 443 (HTTPS, optional)
- Outbound access to WordPress sites for crawling
- Outbound FTP/SFTP access (ports 21, 22)

## Quick Deploy (Proxmox LXC)

### Option 1: Automated Script

Run this on your Proxmox host:

```bash
# Download and run the deployment script
wget https://your-server.com/deploy-wp-static.sh
chmod +x deploy-wp-static.sh
./deploy-wp-static.sh
```

Or copy the script from `/app/scripts/deploy-proxmox-lxc.sh`

### Option 2: Manual Installation

See the detailed steps below.

---

## Manual Installation Steps

### 1. Create LXC Container (Proxmox)

```bash
# On Proxmox host
pct create 200 local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst \
  --hostname wp-static-deployer \
  --memory 2048 \
  --swap 512 \
  --cores 2 \
  --rootfs local-lvm:20 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 \
  --features nesting=1

pct start 200
pct enter 200
```

### 2. System Setup

```bash
# Update system
apt update && apt upgrade -y

# Install dependencies
apt install -y \
  curl \
  wget \
  git \
  nginx \
  python3 \
  python3-pip \
  python3-venv \
  nodejs \
  npm \
  gnupg

# Install MongoDB
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
  gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  tee /etc/apt/sources.list.d/mongodb-org-7.0.list
apt update
apt install -y mongodb-org
systemctl enable mongod
systemctl start mongod

# Install Yarn
npm install -g yarn
```

### 3. Create Application User

```bash
useradd -m -s /bin/bash wpstatic
mkdir -p /opt/wp-static-deployer
chown wpstatic:wpstatic /opt/wp-static-deployer
```

### 4. Deploy Backend

```bash
# As wpstatic user
su - wpstatic
cd /opt/wp-static-deployer

# Create backend directory
mkdir -p backend
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install fastapi uvicorn motor pymongo python-dotenv \
  pydantic beautifulsoup4 lxml paramiko apscheduler \
  aiofiles cryptography requests

# Copy server.py (from your build)
# ... copy the server.py file here ...

# Create .env file
cat > .env << 'EOF'
MONGO_URL=mongodb://localhost:27017
DB_NAME=wp_static_deployer
CORS_ORIGINS=*
ENCRYPTION_KEY=your-secure-encryption-key-change-this
EOF

chmod 600 .env
```

### 5. Deploy Frontend

```bash
cd /opt/wp-static-deployer
mkdir -p frontend

# Copy built React files or build from source
# Option A: Copy pre-built files
# cp -r /path/to/build/* frontend/

# Option B: Build from source
cd frontend
# Copy package.json, src/, public/ directories
yarn install
yarn build
```

### 6. Configure Systemd Service

```bash
# As root
cat > /etc/systemd/system/wp-static-backend.service << 'EOF'
[Unit]
Description=WP Static Deployer Backend
After=network.target mongod.service

[Service]
Type=simple
User=wpstatic
Group=wpstatic
WorkingDirectory=/opt/wp-static-deployer/backend
Environment="PATH=/opt/wp-static-deployer/backend/venv/bin"
ExecStart=/opt/wp-static-deployer/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable wp-static-backend
systemctl start wp-static-backend
```

### 7. Configure Nginx

```bash
cat > /etc/nginx/sites-available/wp-static-deployer << 'EOF'
server {
    listen 80;
    server_name _;
    
    # Frontend
    root /opt/wp-static-deployer/frontend/build;
    index index.html;
    
    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # Frontend routing
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
EOF

ln -sf /etc/nginx/sites-available/wp-static-deployer /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

### 8. Configure Firewall (Optional)

```bash
apt install -y ufw
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_URL` | MongoDB connection string | `mongodb://localhost:27017` |
| `DB_NAME` | Database name | `wp_static_deployer` |
| `CORS_ORIGINS` | Allowed CORS origins | `*` |
| `ENCRYPTION_KEY` | Key for password encryption | (required, change default!) |

### Changing the Encryption Key

**Important**: Change the default encryption key before production use!

```bash
# Generate a secure key
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Update .env file
nano /opt/wp-static-deployer/backend/.env
# Set ENCRYPTION_KEY=<your-generated-key>

# Restart backend
systemctl restart wp-static-backend
```

---

## SSL/TLS Setup (Recommended)

### Using Let's Encrypt

```bash
apt install -y certbot python3-certbot-nginx

# Get certificate (replace with your domain)
certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
```

---

## Maintenance

### View Logs

```bash
# Backend logs
journalctl -u wp-static-backend -f

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# MongoDB logs
tail -f /var/log/mongodb/mongod.log
```

### Backup Database

```bash
# Backup
mongodump --db wp_static_deployer --out /backup/mongodb/$(date +%Y%m%d)

# Restore
mongorestore --db wp_static_deployer /backup/mongodb/20260115/wp_static_deployer
```

### Update Application

```bash
# Stop services
systemctl stop wp-static-backend

# Update backend
cd /opt/wp-static-deployer/backend
source venv/bin/activate
pip install --upgrade -r requirements.txt

# Update frontend (if rebuilding)
cd /opt/wp-static-deployer/frontend
yarn install
yarn build

# Restart services
systemctl start wp-static-backend
```

---

## Troubleshooting

### Backend won't start

```bash
# Check status
systemctl status wp-static-backend

# Test manually
cd /opt/wp-static-deployer/backend
source venv/bin/activate
python -c "from server import app; print('OK')"
```

### MongoDB connection issues

```bash
# Check MongoDB status
systemctl status mongod

# Test connection
mongosh --eval "db.adminCommand('ping')"
```

### Nginx 502 Bad Gateway

```bash
# Check if backend is running
curl http://127.0.0.1:8001/api/

# Check Nginx config
nginx -t
```

---

## Security Recommendations

1. **Change default encryption key** - Critical for password security
2. **Use HTTPS** - Set up SSL/TLS certificates
3. **Restrict network access** - Use firewall rules
4. **Regular updates** - Keep system and dependencies updated
5. **Backup regularly** - Schedule automated database backups
6. **Monitor logs** - Set up log monitoring/alerting

---

## Support

For issues and feature requests, please refer to the project repository.
