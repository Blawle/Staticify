#!/bin/bash
#
# Staticify - Update Script for Existing LXC Deployments
# Repository: https://github.com/Blawle/Staticify
#
# This script updates an existing Staticify installation to the latest version.
# Run this INSIDE your existing LXC container.
#
# Usage: sudo ./update.sh [OPTIONS]
#
# Options:
#   --backup          Create database backup before update (recommended)
#   --migrate-data    Attempt to migrate old site_profiles to new schema
#   --skip-frontend   Skip frontend rebuild
#   --help            Show this help message
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Variables
APP_DIR="/opt/staticify"
APP_USER="staticify"
BACKUP_DIR="/opt/staticify-backups"
DO_BACKUP=false
MIGRATE_DATA=false
SKIP_FRONTEND=false
REPO_URL="https://github.com/Blawle/Staticify.git"

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --backup) DO_BACKUP=true; shift ;;
        --migrate-data) MIGRATE_DATA=true; shift ;;
        --skip-frontend) SKIP_FRONTEND=true; shift ;;
        --help) head -20 "$0" | tail -15; exit 0 ;;
        *) log_error "Unknown option: $1" ;;
    esac
done

# Check root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root: sudo $0"
fi

# Banner
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════╗"
echo "║   STATICIFY - Update Existing Installation ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Check if Staticify is installed
if [ ! -d "$APP_DIR" ]; then
    log_error "Staticify not found at $APP_DIR. Is it installed?"
fi

# Get current version info
log_step "Checking current installation..."
cd $APP_DIR
CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
log_info "Current commit: $CURRENT_COMMIT"

# Backup database if requested
if [ "$DO_BACKUP" = true ]; then
    log_step "Creating database backup..."
    BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
    mkdir -p $BACKUP_DIR
    
    # Get DB name from .env
    DB_NAME=$(grep DB_NAME $APP_DIR/backend/.env | cut -d '=' -f2 || echo "staticify")
    
    mongodump --db "$DB_NAME" --out "$BACKUP_DIR/backup_$BACKUP_DATE" 2>/dev/null
    log_success "Backup created: $BACKUP_DIR/backup_$BACKUP_DATE"
fi

# Stop services
log_step "Stopping services..."
systemctl stop staticify 2>/dev/null || true
log_success "Services stopped"

# Fetch latest code
log_step "Fetching latest code from GitHub..."
cd $APP_DIR

# Stash any local changes
git stash 2>/dev/null || true

# Fetch and reset to latest
git fetch origin main
git reset --hard origin/main

NEW_COMMIT=$(git rev-parse --short HEAD)
log_success "Updated to commit: $NEW_COMMIT"

# Update backend dependencies
log_step "Updating backend dependencies..."
cd $APP_DIR/backend

sudo -u $APP_USER bash -c "source venv/bin/activate && pip install --upgrade pip"
if [ -f requirements.txt ]; then
    sudo -u $APP_USER bash -c "source venv/bin/activate && pip install -r requirements.txt"
else
    sudo -u $APP_USER bash -c "source venv/bin/activate && pip install \
        fastapi uvicorn motor pymongo python-dotenv pydantic \
        beautifulsoup4 lxml paramiko apscheduler aiofiles cryptography requests"
fi
log_success "Backend dependencies updated"

# Rebuild frontend
if [ "$SKIP_FRONTEND" = false ]; then
    log_step "Rebuilding frontend..."
    cd $APP_DIR/frontend
    sudo -u $APP_USER yarn install
    sudo -u $APP_USER bash -c 'echo "REACT_APP_BACKEND_URL=" > .env.production'
    sudo -u $APP_USER yarn build
    log_success "Frontend rebuilt"
else
    log_info "Skipping frontend rebuild"
fi

# Migrate data if requested
if [ "$MIGRATE_DATA" = true ]; then
    log_step "Migrating data from old schema..."
    
    # Migration script
    python3 << 'MIGRATE_EOF'
import os
from pymongo import MongoClient
from dotenv import load_dotenv
import uuid
from datetime import datetime, timezone

load_dotenv('/opt/staticify/backend/.env')

client = MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
db = client[os.environ.get('DB_NAME', 'staticify')]

# Check for old site_profiles collection
if 'site_profiles' in db.list_collection_names():
    old_profiles = list(db.site_profiles.find())
    
    if old_profiles:
        print(f"Found {len(old_profiles)} old site profiles to migrate")
        
        for profile in old_profiles:
            # Create Source from WordPress URL
            source = {
                'id': str(uuid.uuid4()),
                'name': profile.get('name', 'Migrated Source'),
                'url': profile.get('wordpress_url', ''),
                'root_path': profile.get('wordpress_root', '/'),
                'description': f"Migrated from site profile: {profile.get('name', '')}",
                'created_at': profile.get('created_at', datetime.now(timezone.utc).isoformat()),
                'updated_at': datetime.now(timezone.utc).isoformat(),
                'last_crawl': profile.get('last_crawl')
            }
            
            # Create Destination from FTP settings
            destination = {
                'id': str(uuid.uuid4()),
                'name': f"{profile.get('name', 'Migrated')} Server",
                'host': profile.get('external_host', ''),
                'port': profile.get('external_port', 21),
                'protocol': profile.get('external_protocol', 'ftp'),
                'username': profile.get('external_username', ''),
                'password': '',
                'encrypted_password': profile.get('encrypted_password', ''),
                'root_path': profile.get('external_root', '/public_html'),
                'public_url': profile.get('external_url', ''),
                'description': f"Migrated from site profile",
                'created_at': profile.get('created_at', datetime.now(timezone.utc).isoformat()),
                'updated_at': datetime.now(timezone.utc).isoformat(),
                'last_deployment': profile.get('last_deployment'),
                'has_password': bool(profile.get('encrypted_password'))
            }
            
            # Only create if we have valid data
            if source['url']:
                db.sources.insert_one(source)
                print(f"  Created source: {source['name']}")
            
            if destination['host']:
                db.destinations.insert_one(destination)
                print(f"  Created destination: {destination['name']}")
            
            # Create deployment config linking them
            if source['url'] and destination['host']:
                deployment_config = {
                    'id': str(uuid.uuid4()),
                    'name': profile.get('name', 'Migrated Deployment'),
                    'source_id': source['id'],
                    'destination_id': destination['id'],
                    'source_name': source['name'],
                    'destination_name': destination['name'],
                    'description': 'Migrated from old site profile',
                    'auto_crawl': True,
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }
                db.deployment_configs.insert_one(deployment_config)
                print(f"  Created deployment: {deployment_config['name']}")
        
        # Rename old collection to backup
        db.site_profiles.rename('site_profiles_backup_migrated')
        print("Old site_profiles renamed to site_profiles_backup_migrated")
    else:
        print("No old site profiles found")
else:
    print("No site_profiles collection found - nothing to migrate")

print("Migration complete")
MIGRATE_EOF
    
    log_success "Data migration complete"
fi

# Restart services
log_step "Starting services..."
systemctl start staticify
sleep 2

# Verify
if systemctl is-active staticify >/dev/null 2>&1; then
    log_success "Staticify service running"
else
    log_warning "Service may not have started correctly. Check: journalctl -u staticify -f"
fi

# Test API
sleep 2
if curl -sf http://localhost:8001/api/ >/dev/null 2>&1; then
    log_success "API responding"
else
    log_warning "API not responding yet. May need a moment to start."
fi

# Summary
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           UPDATE COMPLETE!                ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Changes in this version:${NC}"
echo "  • Sources: WordPress sites to crawl (no FTP login needed)"
echo "  • Destinations: FTP/SFTP servers (with encrypted credentials)"
echo "  • Deployments: Link one source to one destination"
echo ""
echo -e "${CYAN}Commands:${NC}"
echo -e "  View logs:  ${GREEN}journalctl -u staticify -f${NC}"
echo -e "  Restart:    ${GREEN}systemctl restart staticify${NC}"
echo ""
if [ "$DO_BACKUP" = true ]; then
    echo -e "${CYAN}Backup location:${NC} $BACKUP_DIR/backup_$BACKUP_DATE"
    echo ""
fi
echo -e "${CYAN}Repository:${NC} https://github.com/Blawle/Staticify"
echo ""
