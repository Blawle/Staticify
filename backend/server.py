from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import asyncio
from urllib.parse import urljoin, urlparse
import aiofiles
import json
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Temporary storage for crawl jobs and logs
crawl_jobs: Dict[str, Dict] = {}
deployment_logs: Dict[str, List[str]] = {}

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============ ENCRYPTION UTILITIES ============

# Get or generate encryption key from environment
ENCRYPTION_KEY = os.environ.get('ENCRYPTION_KEY', 'wp-static-deployer-secret-key-2026')

def get_fernet():
    """Generate a Fernet instance using a derived key from the secret"""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b'wp-static-salt-v1',  # Static salt for consistency
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(ENCRYPTION_KEY.encode()))
    return Fernet(key)

def encrypt_password(password: str) -> str:
    """Encrypt a password for secure storage"""
    if not password:
        return ""
    fernet = get_fernet()
    encrypted = fernet.encrypt(password.encode())
    return base64.urlsafe_b64encode(encrypted).decode()

def decrypt_password(encrypted_password: str) -> str:
    """Decrypt a stored password"""
    if not encrypted_password:
        return ""
    try:
        fernet = get_fernet()
        decoded = base64.urlsafe_b64decode(encrypted_password.encode())
        decrypted = fernet.decrypt(decoded)
        return decrypted.decode()
    except Exception as e:
        logger.error(f"Failed to decrypt password: {e}")
        return ""

def mask_password(password: str) -> str:
    """Return a masked version of the password for display"""
    if not password:
        return ""
    return "••••••••"

# ============ MODELS ============

class SiteProfileBase(BaseModel):
    name: str
    wordpress_url: str
    wordpress_root: str = "/"
    external_host: str
    external_port: int = 21
    external_protocol: str = "ftp"  # ftp or sftp
    external_username: str
    external_password: str = ""
    external_root: str = "/public_html"
    external_url: str = ""

class SiteProfileCreate(SiteProfileBase):
    pass

class SiteProfile(SiteProfileBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_deployment: Optional[str] = None
    last_crawl: Optional[str] = None
    has_password: Optional[bool] = False

class SiteProfileResponse(SiteProfile):
    """Response model that includes password status indicator"""
    has_password: bool = False

class DeploymentHistoryBase(BaseModel):
    profile_id: str
    profile_name: str
    status: str = "pending"  # pending, running, success, failed
    files_deployed: int = 0
    files_failed: int = 0
    logs: List[str] = []
    error_message: Optional[str] = None

class DeploymentHistory(DeploymentHistoryBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    started_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None

class ScheduledDeployment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str
    profile_name: str
    cron_expression: str
    enabled: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_run: Optional[str] = None
    next_run: Optional[str] = None

class ScheduledDeploymentCreate(BaseModel):
    profile_id: str
    cron_expression: str
    enabled: bool = True

class CrawlJobStatus(BaseModel):
    job_id: str
    status: str  # pending, running, completed, failed
    pages_crawled: int = 0
    total_pages: int = 0
    current_url: Optional[str] = None
    files: List[str] = []
    errors: List[str] = []

class CompareRequest(BaseModel):
    profile_id: str
    page_path: str = "/"

class CompareResult(BaseModel):
    internal_content: str
    external_content: str
    differences: List[Dict[str, Any]]
    has_differences: bool

class FileCompareResult(BaseModel):
    internal_files: List[str]
    external_files: List[str]
    added: List[str]
    removed: List[str]
    modified: List[str]

# ============ SITE PROFILES ENDPOINTS ============

@api_router.get("/profiles", response_model=List[SiteProfile])
async def get_profiles():
    profiles = await db.site_profiles.find({}, {"_id": 0}).to_list(100)
    # Mask passwords in response (never send actual passwords to frontend)
    for profile in profiles:
        profile["external_password"] = mask_password(profile.get("external_password", ""))
        # Add flag to indicate password is set
        profile["has_password"] = bool(profile.get("encrypted_password"))
    return profiles

@api_router.get("/profiles/{profile_id}", response_model=SiteProfile)
async def get_profile(profile_id: str):
    profile = await db.site_profiles.find_one({"id": profile_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    # Mask password in response
    profile["external_password"] = mask_password(profile.get("external_password", ""))
    profile["has_password"] = bool(profile.get("encrypted_password"))
    return profile

@api_router.post("/profiles", response_model=SiteProfile)
async def create_profile(profile_data: SiteProfileCreate):
    profile = SiteProfile(**profile_data.model_dump())
    profile_dict = profile.model_dump()
    
    # Encrypt the password before storing
    if profile_dict.get("external_password"):
        profile_dict["encrypted_password"] = encrypt_password(profile_dict["external_password"])
        profile_dict["external_password"] = ""  # Don't store plain text
    
    await db.site_profiles.insert_one(profile_dict)
    
    # Return masked password in response
    profile_dict["external_password"] = mask_password(profile_data.external_password)
    profile_dict["has_password"] = bool(profile_data.external_password)
    return profile_dict

@api_router.put("/profiles/{profile_id}", response_model=SiteProfile)
async def update_profile(profile_id: str, profile_data: SiteProfileCreate):
    existing = await db.site_profiles.find_one({"id": profile_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    updated_data = profile_data.model_dump()
    updated_data["id"] = profile_id
    updated_data["created_at"] = existing.get("created_at", datetime.now(timezone.utc).isoformat())
    updated_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    updated_data["last_deployment"] = existing.get("last_deployment")
    updated_data["last_crawl"] = existing.get("last_crawl")
    
    # Handle password update
    if updated_data.get("external_password") and updated_data["external_password"] != "••••••••":
        # New password provided - encrypt it
        updated_data["encrypted_password"] = encrypt_password(updated_data["external_password"])
        updated_data["external_password"] = ""
    else:
        # Keep existing encrypted password
        updated_data["encrypted_password"] = existing.get("encrypted_password", "")
        updated_data["external_password"] = ""
    
    await db.site_profiles.update_one({"id": profile_id}, {"$set": updated_data})
    
    # Return masked password
    updated_data["external_password"] = mask_password("password")
    updated_data["has_password"] = bool(updated_data.get("encrypted_password"))
    return updated_data

@api_router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str):
    result = await db.site_profiles.delete_one({"id": profile_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"message": "Profile deleted"}

# ============ CRAWLER ENDPOINTS ============

async def crawl_website(job_id: str, profile: dict):
    """Background task to crawl a WordPress website"""
    import requests
    from bs4 import BeautifulSoup
    import re
    
    crawl_jobs[job_id] = {
        "status": "running",
        "pages_crawled": 0,
        "total_pages": 0,
        "current_url": None,
        "files": [],
        "errors": []
    }
    
    base_url = profile["wordpress_url"].rstrip("/")
    visited = set()
    to_visit = [base_url + profile.get("wordpress_root", "/")]
    files_saved = []
    
    # Create temp directory for crawled files
    crawl_dir = Path(f"/tmp/crawl_{job_id}")
    crawl_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        while to_visit and len(visited) < 500:  # Limit to 500 pages
            url = to_visit.pop(0)
            if url in visited:
                continue
            
            visited.add(url)
            crawl_jobs[job_id]["current_url"] = url
            crawl_jobs[job_id]["pages_crawled"] = len(visited)
            crawl_jobs[job_id]["total_pages"] = len(visited) + len(to_visit)
            
            try:
                response = requests.get(url, timeout=30, headers={
                    "User-Agent": "WP-Static-Crawler/1.0"
                })
                
                if response.status_code != 200:
                    crawl_jobs[job_id]["errors"].append(f"Failed to fetch {url}: {response.status_code}")
                    continue
                
                content_type = response.headers.get("Content-Type", "")
                
                if "text/html" in content_type:
                    soup = BeautifulSoup(response.text, "lxml")
                    
                    # Remove WordPress-specific elements
                    for script in soup.find_all("script"):
                        if script.get("src") and ("wp-" in script.get("src", "") or "wordpress" in script.get("src", "").lower()):
                            script.decompose()
                    
                    # Find all links
                    for link in soup.find_all("a", href=True):
                        href = link["href"]
                        full_url = urljoin(url, href)
                        parsed = urlparse(full_url)
                        
                        # Only crawl same-domain links
                        if parsed.netloc == urlparse(base_url).netloc:
                            clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                            if clean_url not in visited and clean_url not in to_visit:
                                to_visit.append(clean_url)
                    
                    # Download CSS, JS, Images
                    for tag in soup.find_all(["link", "script", "img"]):
                        src = tag.get("href") or tag.get("src")
                        if src:
                            asset_url = urljoin(url, src)
                            parsed_asset = urlparse(asset_url)
                            if parsed_asset.netloc == urlparse(base_url).netloc:
                                try:
                                    asset_response = requests.get(asset_url, timeout=30)
                                    if asset_response.status_code == 200:
                                        asset_path = parsed_asset.path.lstrip("/")
                                        if not asset_path:
                                            asset_path = "index.html"
                                        asset_file = crawl_dir / asset_path
                                        asset_file.parent.mkdir(parents=True, exist_ok=True)
                                        
                                        mode = "w" if "text" in asset_response.headers.get("Content-Type", "") else "wb"
                                        content = asset_response.text if mode == "w" else asset_response.content
                                        
                                        with open(asset_file, mode) as f:
                                            f.write(content)
                                        files_saved.append(asset_path)
                                except Exception as e:
                                    crawl_jobs[job_id]["errors"].append(f"Failed to download asset {asset_url}: {str(e)}")
                    
                    # Save HTML file
                    parsed_url = urlparse(url)
                    page_path = parsed_url.path.lstrip("/")
                    if not page_path or page_path.endswith("/"):
                        page_path = (page_path or "") + "index.html"
                    elif not page_path.endswith(".html"):
                        page_path = page_path + "/index.html"
                    
                    html_file = crawl_dir / page_path
                    html_file.parent.mkdir(parents=True, exist_ok=True)
                    
                    with open(html_file, "w", encoding="utf-8") as f:
                        f.write(str(soup))
                    files_saved.append(page_path)
                    
            except Exception as e:
                crawl_jobs[job_id]["errors"].append(f"Error crawling {url}: {str(e)}")
        
        crawl_jobs[job_id]["status"] = "completed"
        crawl_jobs[job_id]["files"] = list(set(files_saved))
        
        # Update profile with last crawl time
        await db.site_profiles.update_one(
            {"id": profile["id"]},
            {"$set": {"last_crawl": datetime.now(timezone.utc).isoformat()}}
        )
        
    except Exception as e:
        crawl_jobs[job_id]["status"] = "failed"
        crawl_jobs[job_id]["errors"].append(f"Crawl failed: {str(e)}")

@api_router.post("/crawler/start/{profile_id}")
async def start_crawler(profile_id: str, background_tasks: BackgroundTasks):
    profile = await db.site_profiles.find_one({"id": profile_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    job_id = str(uuid.uuid4())
    crawl_jobs[job_id] = {
        "status": "pending",
        "pages_crawled": 0,
        "total_pages": 0,
        "current_url": None,
        "files": [],
        "errors": []
    }
    
    background_tasks.add_task(crawl_website, job_id, profile)
    return {"job_id": job_id, "status": "started"}

@api_router.get("/crawler/status/{job_id}")
async def get_crawler_status(job_id: str):
    if job_id not in crawl_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = crawl_jobs[job_id]
    return CrawlJobStatus(job_id=job_id, **job)

# ============ DEPLOYMENT ENDPOINTS ============

async def deploy_via_ftp(deployment_id: str, profile: dict, job_id: str):
    """Deploy files via FTP"""
    import ftplib
    
    logs = []
    files_deployed = 0
    files_failed = 0
    
    deployment_logs[deployment_id] = logs
    
    try:
        logs.append(f"[INFO] Connecting to {profile['external_host']}:{profile['external_port']} via FTP...")
        
        # Decrypt password for connection
        password = decrypt_password(profile.get("encrypted_password", ""))
        if not password and profile.get("external_password"):
            password = profile["external_password"]  # Fallback for legacy data
        
        ftp = ftplib.FTP()
        ftp.connect(profile["external_host"], profile["external_port"], timeout=30)
        ftp.login(profile["external_username"], password)
        
        logs.append("[SUCCESS] Connected successfully (credentials secured)")
        
        # Navigate to root directory
        try:
            ftp.cwd(profile["external_root"])
            logs.append(f"[INFO] Changed to directory: {profile['external_root']}")
        except Exception:
            logs.append(f"[WARNING] Could not change to {profile['external_root']}, using current directory")
        
        # Get crawled files
        crawl_dir = Path(f"/tmp/crawl_{job_id}")
        if not crawl_dir.exists():
            logs.append("[ERROR] Crawl directory not found. Please run crawler first.")
            await db.deployment_history.update_one(
                {"id": deployment_id},
                {"$set": {
                    "status": "failed",
                    "error_message": "Crawl directory not found",
                    "logs": logs,
                    "completed_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            return
        
        # Upload files
        for file_path in crawl_dir.rglob("*"):
            if file_path.is_file():
                relative_path = file_path.relative_to(crawl_dir)
                remote_path = str(relative_path)
                
                try:
                    # Create directories if needed
                    remote_dir = str(relative_path.parent)
                    if remote_dir and remote_dir != ".":
                        dirs = remote_dir.split("/")
                        current = ""
                        for d in dirs:
                            current = f"{current}/{d}" if current else d
                            try:
                                ftp.mkd(current)
                            except Exception:
                                pass
                    
                    # Upload file
                    with open(file_path, "rb") as f:
                        ftp.storbinary(f"STOR {remote_path}", f)
                    
                    files_deployed += 1
                    logs.append(f"[SUCCESS] Uploaded: {remote_path}")
                    
                except Exception as e:
                    files_failed += 1
                    logs.append(f"[ERROR] Failed to upload {remote_path}: {str(e)}")
        
        ftp.quit()
        logs.append(f"[INFO] Deployment completed. {files_deployed} files uploaded, {files_failed} failed.")
        
        status = "success" if files_failed == 0 else "partial"
        
        await db.deployment_history.update_one(
            {"id": deployment_id},
            {"$set": {
                "status": status,
                "files_deployed": files_deployed,
                "files_failed": files_failed,
                "logs": logs,
                "completed_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        await db.site_profiles.update_one(
            {"id": profile["id"]},
            {"$set": {"last_deployment": datetime.now(timezone.utc).isoformat()}}
        )
        
    except Exception as e:
        logs.append(f"[ERROR] Deployment failed: {str(e)}")
        await db.deployment_history.update_one(
            {"id": deployment_id},
            {"$set": {
                "status": "failed",
                "error_message": str(e),
                "logs": logs,
                "completed_at": datetime.now(timezone.utc).isoformat()
            }}
        )

async def deploy_via_sftp(deployment_id: str, profile: dict, job_id: str):
    """Deploy files via SFTP"""
    import paramiko
    
    logs = []
    files_deployed = 0
    files_failed = 0
    
    deployment_logs[deployment_id] = logs
    
    try:
        logs.append(f"[INFO] Connecting to {profile['external_host']}:{profile['external_port']} via SFTP...")
        
        # Decrypt password for connection
        password = decrypt_password(profile.get("encrypted_password", ""))
        if not password and profile.get("external_password"):
            password = profile["external_password"]  # Fallback for legacy data
        
        transport = paramiko.Transport((profile["external_host"], profile["external_port"]))
        transport.connect(username=profile["external_username"], password=password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        
        logs.append("[SUCCESS] Connected successfully (credentials secured)")
        
        # Get crawled files
        crawl_dir = Path(f"/tmp/crawl_{job_id}")
        if not crawl_dir.exists():
            logs.append("[ERROR] Crawl directory not found. Please run crawler first.")
            await db.deployment_history.update_one(
                {"id": deployment_id},
                {"$set": {
                    "status": "failed",
                    "error_message": "Crawl directory not found",
                    "logs": logs,
                    "completed_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            return
        
        remote_root = profile["external_root"]
        
        # Upload files
        for file_path in crawl_dir.rglob("*"):
            if file_path.is_file():
                relative_path = file_path.relative_to(crawl_dir)
                remote_path = f"{remote_root}/{relative_path}"
                
                try:
                    # Create directories if needed
                    dirs = str(relative_path.parent).split("/")
                    current = remote_root
                    for d in dirs:
                        if d and d != ".":
                            current = f"{current}/{d}"
                            try:
                                sftp.mkdir(current)
                            except Exception:
                                pass
                    
                    # Upload file
                    sftp.put(str(file_path), remote_path)
                    
                    files_deployed += 1
                    logs.append(f"[SUCCESS] Uploaded: {relative_path}")
                    
                except Exception as e:
                    files_failed += 1
                    logs.append(f"[ERROR] Failed to upload {relative_path}: {str(e)}")
        
        sftp.close()
        transport.close()
        logs.append(f"[INFO] Deployment completed. {files_deployed} files uploaded, {files_failed} failed.")
        
        status = "success" if files_failed == 0 else "partial"
        
        await db.deployment_history.update_one(
            {"id": deployment_id},
            {"$set": {
                "status": status,
                "files_deployed": files_deployed,
                "files_failed": files_failed,
                "logs": logs,
                "completed_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        await db.site_profiles.update_one(
            {"id": profile["id"]},
            {"$set": {"last_deployment": datetime.now(timezone.utc).isoformat()}}
        )
        
    except Exception as e:
        logs.append(f"[ERROR] Deployment failed: {str(e)}")
        await db.deployment_history.update_one(
            {"id": deployment_id},
            {"$set": {
                "status": "failed",
                "error_message": str(e),
                "logs": logs,
                "completed_at": datetime.now(timezone.utc).isoformat()
            }}
        )

@api_router.post("/deploy/{profile_id}")
async def start_deployment(profile_id: str, background_tasks: BackgroundTasks, job_id: Optional[str] = None):
    profile = await db.site_profiles.find_one({"id": profile_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Find the most recent crawl job for this profile
    if not job_id:
        # Look for any recent crawl job
        for jid, job in crawl_jobs.items():
            if job.get("status") == "completed":
                job_id = jid
                break
    
    if not job_id:
        raise HTTPException(status_code=400, detail="No crawl job found. Please run the crawler first.")
    
    deployment = DeploymentHistory(
        profile_id=profile_id,
        profile_name=profile["name"],
        status="running"
    )
    
    await db.deployment_history.insert_one(deployment.model_dump())
    
    if profile["external_protocol"] == "sftp":
        background_tasks.add_task(deploy_via_sftp, deployment.id, profile, job_id)
    else:
        background_tasks.add_task(deploy_via_ftp, deployment.id, profile, job_id)
    
    return {"deployment_id": deployment.id, "status": "started"}

@api_router.get("/deploy/logs/{deployment_id}")
async def get_deployment_logs(deployment_id: str):
    deployment = await db.deployment_history.find_one({"id": deployment_id}, {"_id": 0})
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return deployment

# ============ HISTORY ENDPOINTS ============

@api_router.get("/history", response_model=List[DeploymentHistory])
async def get_deployment_history(limit: int = 50):
    history = await db.deployment_history.find({}, {"_id": 0}).sort("started_at", -1).to_list(limit)
    return history

@api_router.get("/history/{profile_id}", response_model=List[DeploymentHistory])
async def get_profile_history(profile_id: str, limit: int = 20):
    history = await db.deployment_history.find(
        {"profile_id": profile_id}, 
        {"_id": 0}
    ).sort("started_at", -1).to_list(limit)
    return history

# ============ SCHEDULED DEPLOYMENTS ENDPOINTS ============

@api_router.get("/schedules", response_model=List[ScheduledDeployment])
async def get_schedules():
    schedules = await db.scheduled_deployments.find({}, {"_id": 0}).to_list(100)
    return schedules

@api_router.post("/schedules", response_model=ScheduledDeployment)
async def create_schedule(schedule_data: ScheduledDeploymentCreate):
    profile = await db.site_profiles.find_one({"id": schedule_data.profile_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    schedule = ScheduledDeployment(
        profile_id=schedule_data.profile_id,
        profile_name=profile["name"],
        cron_expression=schedule_data.cron_expression,
        enabled=schedule_data.enabled
    )
    
    await db.scheduled_deployments.insert_one(schedule.model_dump())
    return schedule

@api_router.put("/schedules/{schedule_id}")
async def update_schedule(schedule_id: str, enabled: bool):
    result = await db.scheduled_deployments.update_one(
        {"id": schedule_id},
        {"$set": {"enabled": enabled}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"message": "Schedule updated"}

@api_router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str):
    result = await db.scheduled_deployments.delete_one({"id": schedule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"message": "Schedule deleted"}

# ============ COMPARISON ENDPOINTS ============

@api_router.post("/compare/content")
async def compare_content(request: CompareRequest):
    import requests
    from bs4 import BeautifulSoup
    import difflib
    
    profile = await db.site_profiles.find_one({"id": request.profile_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    internal_url = f"{profile['wordpress_url'].rstrip('/')}{request.page_path}"
    external_url = f"{profile['external_url'].rstrip('/')}{request.page_path}" if profile.get('external_url') else None
    
    try:
        internal_response = requests.get(internal_url, timeout=30)
        internal_content = internal_response.text if internal_response.status_code == 200 else ""
    except Exception:
        internal_content = ""
    
    external_content = ""
    if external_url:
        try:
            external_response = requests.get(external_url, timeout=30)
            external_content = external_response.text if external_response.status_code == 200 else ""
        except Exception:
            pass
    
    # Calculate differences
    internal_lines = internal_content.splitlines(keepends=True)
    external_lines = external_content.splitlines(keepends=True)
    
    differ = difflib.unified_diff(internal_lines, external_lines, lineterm='')
    diff_list = list(differ)
    
    differences = []
    for line in diff_list:
        if line.startswith('+') and not line.startswith('+++'):
            differences.append({"type": "added", "content": line[1:]})
        elif line.startswith('-') and not line.startswith('---'):
            differences.append({"type": "removed", "content": line[1:]})
    
    return CompareResult(
        internal_content=internal_content,
        external_content=external_content,
        differences=differences,
        has_differences=len(differences) > 0
    )

@api_router.post("/compare/files")
async def compare_files(request: CompareRequest):
    import requests
    from bs4 import BeautifulSoup
    
    profile = await db.site_profiles.find_one({"id": request.profile_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # This would typically scan both sites for files
    # For now, we'll compare based on crawled data
    internal_files = []
    external_files = []
    
    # Find latest crawl for this profile
    for job_id, job in crawl_jobs.items():
        if job.get("status") == "completed":
            internal_files = job.get("files", [])
            break
    
    # Calculate differences
    internal_set = set(internal_files)
    external_set = set(external_files)
    
    added = list(internal_set - external_set)
    removed = list(external_set - internal_set)
    modified = []  # Would need to compare file hashes
    
    return FileCompareResult(
        internal_files=internal_files,
        external_files=external_files,
        added=added,
        removed=removed,
        modified=modified
    )

# ============ STATS ENDPOINT ============

@api_router.get("/stats")
async def get_stats():
    total_sites = await db.site_profiles.count_documents({})
    total_deployments = await db.deployment_history.count_documents({})
    successful_deployments = await db.deployment_history.count_documents({"status": "success"})
    failed_deployments = await db.deployment_history.count_documents({"status": "failed"})
    scheduled_count = await db.scheduled_deployments.count_documents({"enabled": True})
    
    # Get recent activity
    recent = await db.deployment_history.find({}, {"_id": 0}).sort("started_at", -1).to_list(5)
    
    return {
        "total_sites": total_sites,
        "total_deployments": total_deployments,
        "successful_deployments": successful_deployments,
        "failed_deployments": failed_deployments,
        "active_schedules": scheduled_count,
        "recent_activity": recent
    }

# ============ ROOT ENDPOINT ============

@api_router.get("/")
async def root():
    return {"message": "WordPress to Static Deployer API"}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
