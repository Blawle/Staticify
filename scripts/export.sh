#!/bin/bash
#
# Export script - packages the application for deployment
#
# Creates a tarball with all necessary files for deployment
#

set -e

EXPORT_DIR="/tmp/wp-static-deployer-export"
TARBALL="/tmp/wp-static-deployer.tar.gz"

echo "Creating export package..."

# Clean up
rm -rf $EXPORT_DIR
mkdir -p $EXPORT_DIR/{backend,frontend,scripts}

# Copy backend
cp /app/backend/server.py $EXPORT_DIR/backend/
cp /app/backend/requirements.txt $EXPORT_DIR/backend/ 2>/dev/null || true

# Create requirements.txt if not exists
if [ ! -f "$EXPORT_DIR/backend/requirements.txt" ]; then
    cat > $EXPORT_DIR/backend/requirements.txt << 'EOF'
fastapi==0.110.1
uvicorn==0.25.0
motor==3.3.1
pymongo==4.5.0
python-dotenv>=1.0.1
pydantic>=2.6.4
beautifulsoup4>=4.12.0
lxml>=5.0.0
paramiko>=3.0.0
apscheduler>=3.10.0
aiofiles>=23.0.0
cryptography>=42.0.0
requests>=2.31.0
EOF
fi

# Build frontend if source exists
if [ -d "/app/frontend/src" ]; then
    echo "Building frontend..."
    cd /app/frontend
    
    # Update .env for production
    echo "REACT_APP_BACKEND_URL=" > .env.production
    
    yarn build 2>/dev/null || npm run build
    
    # Copy build
    cp -r build $EXPORT_DIR/frontend/
fi

# Copy scripts
cp /app/scripts/deploy-proxmox-lxc.sh $EXPORT_DIR/scripts/ 2>/dev/null || true
cp /app/scripts/install.sh $EXPORT_DIR/scripts/ 2>/dev/null || true
cp /app/DEPLOYMENT_GUIDE.md $EXPORT_DIR/ 2>/dev/null || true

# Create sample .env
cat > $EXPORT_DIR/backend/.env.example << 'EOF'
MONGO_URL=mongodb://localhost:27017
DB_NAME=wp_static_deployer
CORS_ORIGINS=*
ENCRYPTION_KEY=change-this-to-a-secure-random-key
EOF

# Create tarball
cd /tmp
tar -czvf $TARBALL -C $EXPORT_DIR .

echo ""
echo "Export complete!"
echo "Package: $TARBALL"
echo "Size: $(du -h $TARBALL | cut -f1)"
echo ""
echo "To deploy:"
echo "1. Copy $TARBALL to your server"
echo "2. Extract: tar -xzvf wp-static-deployer.tar.gz -C /opt/wp-static-deployer"
echo "3. Run: sudo bash scripts/install.sh"
