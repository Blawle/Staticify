# WordPress to Static Deployer

A self-hostable tool for converting WordPress websites to static HTML and deploying via FTP/SFTP.

## Features

- **WordPress Crawler**: Recursively crawls WordPress sites and converts to static HTML
- **FTP/SFTP Deployment**: Deploy to any web server with FTP or SFTP access
- **Site Comparison**: Visual diff and file-based comparison between source and deployed sites
- **Multiple Profiles**: Manage multiple site configurations
- **Scheduled Deployments**: Automate deployments with cron expressions
- **Deployment History**: Full logs and history of all deployments
- **Secure Credentials**: FTP/SFTP passwords encrypted with AES-256

## Quick Start

### Option 1: Proxmox LXC (Recommended)

```bash
# On your Proxmox host
wget https://raw.githubusercontent.com/your-repo/wp-static-deployer/main/scripts/deploy-proxmox-lxc.sh
chmod +x deploy-proxmox-lxc.sh
./deploy-proxmox-lxc.sh --hostname wp-static --memory 2048 --cores 2
```

### Option 2: Standalone Installation

```bash
# On any Ubuntu/Debian server
wget https://raw.githubusercontent.com/your-repo/wp-static-deployer/main/scripts/install.sh
chmod +x install.sh
sudo ./install.sh
```

### Option 3: Docker (Coming Soon)

```bash
docker-compose up -d
```

## Documentation

- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Full installation and configuration instructions
- [API Reference](docs/API.md) - Backend API documentation

## Directory Structure

```
/app
├── backend/
│   ├── server.py          # FastAPI application
│   ├── .env               # Environment configuration
│   └── requirements.txt   # Python dependencies
├── frontend/
│   ├── src/               # React source code
│   ├── build/             # Production build
│   └── package.json       # Node dependencies
├── scripts/
│   ├── deploy-proxmox-lxc.sh  # Proxmox deployment script
│   ├── install.sh             # Standalone installation
│   └── export.sh              # Export for distribution
└── DEPLOYMENT_GUIDE.md    # Detailed deployment instructions
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_URL` | MongoDB connection string | `mongodb://localhost:27017` |
| `DB_NAME` | Database name | `wp_static_deployer` |
| `ENCRYPTION_KEY` | AES encryption key | (auto-generated) |
| `CORS_ORIGINS` | Allowed CORS origins | `*` |

### Security

**Important**: Change the default encryption key before production use!

```bash
# Generate a secure key
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Tech Stack

- **Backend**: FastAPI, MongoDB, Python 3.11+
- **Frontend**: React 19, Tailwind CSS, Shadcn/UI
- **Crawler**: BeautifulSoup4, lxml
- **FTP/SFTP**: ftplib, Paramiko
- **Encryption**: cryptography (Fernet/AES-256)

## License

MIT License - See LICENSE file for details.
