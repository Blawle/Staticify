# Staticify - Deployment Guide

**Repository:** https://github.com/Blawle/Staticify

## Overview

This guide covers deploying Staticify (WordPress to Static Deployer) to a **lightweight LXC container** on Proxmox. LXC containers are preferred over full VMs because they:

- Use significantly less resources (RAM, CPU, storage)
- Start in seconds rather than minutes
- Provide near-native performance
- Are easier to backup and migrate

### Deployment Stack

- **Frontend**: React application (served via Nginx)
- **Backend**: FastAPI Python application (via Uvicorn + systemd)
- **Database**: MongoDB
- **Reverse Proxy**: Nginx

## System Requirements

### LXC Container Requirements
- **CPU**: 2 cores
- **RAM**: 2GB (4GB recommended for large sites)
- **Storage**: 20GB
- **Template**: Ubuntu 22.04 LTS or Debian 12

### Network Requirements
- Port 80 (HTTP)
- Port 443 (HTTPS, optional)
- Outbound access to WordPress sites for crawling
- Outbound FTP/SFTP access (ports 21, 22)

---

## Quick Deploy (Proxmox LXC)

### One-Line Installation

Run this on your **Proxmox host** (not inside a container):

```bash
wget -qO- https://raw.githubusercontent.com/Blawle/Staticify/main/scripts/deploy-proxmox-lxc.sh | bash
```

### Or with custom options:

```bash
wget https://raw.githubusercontent.com/Blawle/Staticify/main/scripts/deploy-proxmox-lxc.sh
chmod +x deploy-proxmox-lxc.sh

# Basic deployment
./deploy-proxmox-lxc.sh

# With custom settings
./deploy-proxmox-lxc.sh \
  --ctid 200 \
  --hostname staticify \
  --memory 4096 \
  --cores 4 \
  --ip 192.168.1.100/24 \
  --gateway 192.168.1.1 \
  --domain staticify.example.com
```

### Script Options

| Option | Description | Default |
|--------|-------------|---------|
| `--ctid <id>` | Container ID | Auto-detect |
| `--hostname <name>` | Container hostname | `staticify` |
| `--memory <mb>` | RAM in MB | `2048` |
| `--cores <n>` | CPU cores | `2` |
| `--storage <name>` | Storage pool | Interactive selection |
| `--disk <gb>` | Disk size in GB | `20` |
| `--bridge <name>` | Network bridge | `vmbr0` |
| `--ip <address>` | Static IP (CIDR) | `dhcp` |
| `--gateway <address>` | Gateway IP | (required if static) |
| `--domain <domain>` | Domain for SSL | (optional) |
| `--encryption-key <key>` | Custom encryption key | Auto-generate |
| `--non-interactive` | Skip prompts, use defaults | (flag) |

### Storage Selection

The script automatically detects all available storage locations on your Proxmox host and presents them for selection:

```
Available Storage Locations:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   1) local-lvm       lvmthin    ● 50GB free
   2) ceph-pool       rbd        ● 500GB free  
   3) nfs-storage     nfs        ● 1TB free
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Select storage location [1-3] (or press Enter for local-lvm): 
```

To skip the interactive prompt, use `--storage <name>` or `--non-interactive`:

---

## Manual Installation

### Step 1: Create LXC Container

On your Proxmox host:

```bash
# Download Ubuntu 22.04 template
pveam update
pveam download local ubuntu-22.04-standard_22.04-1_amd64.tar.zst

# Create LXC container (NOT a VM)
pct create 200 local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst \
  --hostname staticify \
  --memory 2048 \
  --swap 512 \
  --cores 2 \
  --rootfs local-lvm:20 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 \
  --features nesting=1 \
  --onboot 1

# Start and enter container
pct start 200
pct enter 200
```

### Step 2: Install Dependencies

Inside the LXC container:

```bash
# Update system
apt update && apt upgrade -y

# Install base packages
apt install -y curl wget git nginx python3 python3-pip python3-venv gnupg ca-certificates

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g yarn

# Install MongoDB 7.0
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
  gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  tee /etc/apt/sources.list.d/mongodb-org-7.0.list
apt update && apt install -y mongodb-org
systemctl enable mongod && systemctl start mongod
```

### Step 3: Clone Repository

```bash
# Create application user
useradd -m -s /bin/bash staticify

# Clone from GitHub
cd /opt
git clone https://github.com/Blawle/Staticify.git staticify
chown -R staticify:staticify /opt/staticify
```

### Step 4: Setup Backend

```bash
cd /opt/staticify/backend

# Create virtual environment
sudo -u staticify python3 -m venv venv
sudo -u staticify bash -c "source venv/bin/activate && pip install --upgrade pip"
sudo -u staticify bash -c "source venv/bin/activate && pip install -r requirements.txt"

# Create environment file
cat > .env << 'EOF'
MONGO_URL=mongodb://localhost:27017
DB_NAME=staticify
CORS_ORIGINS=*
ENCRYPTION_KEY=CHANGE-THIS-TO-A-SECURE-KEY
EOF

chmod 600 .env
chown staticify:staticify .env

# Generate secure encryption key
SECURE_KEY=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
sed -i "s/CHANGE-THIS-TO-A-SECURE-KEY/$SECURE_KEY/" .env
echo "Encryption key: $SECURE_KEY"
```

### Step 5: Build Frontend

```bash
cd /opt/staticify/frontend

# Install dependencies and build
sudo -u staticify yarn install
sudo -u staticify bash -c "echo 'REACT_APP_BACKEND_URL=' > .env.production"
sudo -u staticify yarn build
```

### Step 6: Configure Systemd Service

```bash
cat > /etc/systemd/system/staticify.service << 'EOF'
[Unit]
Description=Staticify Backend
After=network.target mongod.service

[Service]
Type=simple
User=staticify
Group=staticify
WorkingDirectory=/opt/staticify/backend
Environment="PATH=/opt/staticify/backend/venv/bin"
ExecStart=/opt/staticify/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable staticify
systemctl start staticify
```

### Step 7: Configure Nginx

```bash
cat > /etc/nginx/sites-available/staticify << 'EOF'
server {
    listen 80;
    server_name _;
    
    root /opt/staticify/frontend/build;
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
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # Frontend routing (SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
}
EOF

ln -sf /etc/nginx/sites-available/staticify /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

### Step 8: Configure Firewall

```bash
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

---

## SSL/TLS Configuration

### Using Let's Encrypt (Recommended)

```bash
apt install -y certbot python3-certbot-nginx

# Replace with your domain
certbot --nginx -d your-domain.com

# Verify auto-renewal
certbot renew --dry-run
```

---

## Post-Installation

### Verify Installation

```bash
# Check services
systemctl status staticify
systemctl status mongod
systemctl status nginx

# Test API
curl http://localhost:8001/api/

# Get container IP
hostname -I
```

### Access the Application

Open your browser and navigate to:
- **HTTP**: `http://<container-ip>`
- **HTTPS**: `https://your-domain.com` (if SSL configured)

---

## Updating

```bash
cd /opt/staticify

# Pull latest changes
git pull origin main

# Update backend
cd backend
source venv/bin/activate
pip install -r requirements.txt

# Rebuild frontend
cd ../frontend
yarn install
yarn build

# Restart service
systemctl restart staticify
```

---

## Backup & Restore

### Backup

```bash
# Backup database
mongodump --db staticify --out /backup/$(date +%Y%m%d)

# Backup configuration
cp /opt/staticify/backend/.env /backup/
```

### Restore

```bash
# Restore database
mongorestore --db staticify /backup/20260115/staticify

# Restore configuration
cp /backup/.env /opt/staticify/backend/
systemctl restart staticify
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
journalctl -u staticify -f

# Test manually
cd /opt/staticify/backend
source venv/bin/activate
python -c "from server import app; print('OK')"
uvicorn server:app --host 127.0.0.1 --port 8001
```

### MongoDB Issues

```bash
# Check status
systemctl status mongod
journalctl -u mongod -f

# Test connection
mongosh --eval "db.adminCommand('ping')"
```

### Nginx 502 Bad Gateway

```bash
# Check if backend is running
curl http://127.0.0.1:8001/api/

# Verify Nginx config
nginx -t

# Check Nginx logs
tail -f /var/log/nginx/error.log
```

---

## Security Checklist

- [ ] Changed default encryption key
- [ ] Configured SSL/TLS certificate
- [ ] Enabled firewall (UFW)
- [ ] Set up automated backups
- [ ] Configured fail2ban (optional)
- [ ] Limited SSH access

---

## Support

- **Repository**: https://github.com/Blawle/Staticify
- **Issues**: https://github.com/Blawle/Staticify/issues
