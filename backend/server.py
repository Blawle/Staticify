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

ENCRYPTION_KEY = os.environ.get('ENCRYPTION_KEY', 'wp-static-deployer-secret-key-2026')

def get_fernet():
    """Generate a Fernet instance using a derived key from the secret"""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b'wp-static-salt-v1',
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

# Source: WordPress site to crawl (no credentials needed)
class SourceBase(BaseModel):
    name: str
    url: str  # WordPress site URL
    root_path: str = "/"  # Starting path to crawl
    description: Optional[str] = ""

class SourceCreate(SourceBase):
    pass

class Source(SourceBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_crawl: Optional[str] = None

# Destination: FTP/SFTP host for deployment
class DestinationBase(BaseModel):
    name: str
    host: str
    port: int = 21
    protocol: str = "ftp"  # ftp or sftp
    username: str
    password: str = ""
    root_path: str = "/public_html"  # Where to deploy files
    public_url: Optional[str] = ""  # Public URL of deployed site (for comparison)
    description: Optional[str] = ""

class DestinationCreate(DestinationBase):
    pass

class Destination(DestinationBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_deployment: Optional[str] = None
    has_password: bool = False

# Deployment Configuration: Links one source to one destination
class DeploymentConfigBase(BaseModel):
    name: str
    source_id: str
    destination_id: str
    description: Optional[str] = ""
    auto_crawl: bool = True  # Crawl before deploying

class DeploymentConfigCreate(DeploymentConfigBase):
    pass

class DeploymentConfig(DeploymentConfigBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_run: Optional[str] = None
    source_name: Optional[str] = None
    destination_name: Optional[str] = None

# Deployment History
class DeploymentHistoryBase(BaseModel):
    deployment_config_id: str
    deployment_name: str
    source_name: str
    destination_name: str
    status: str = "pending"  # pending, crawling, deploying, success, failed
    pages_crawled: int = 0
    files_deployed: int = 0
    files_failed: int = 0
    logs: List[str] = []
    error_message: Optional[str] = None

class DeploymentHistory(DeploymentHistoryBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    started_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None

# Scheduled Deployment
class ScheduledDeployment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    deployment_config_id: str
    deployment_name: str
    cron_expression: str
    enabled: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_run: Optional[str] = None
    next_run: Optional[str] = None

class ScheduledDeploymentCreate(BaseModel):
    deployment_config_id: str
    cron_expression: str
    enabled: bool = True

# Comparison
class CompareRequest(BaseModel):
    deployment_config_id: str
    page_path: str = "/"

class CompareResult(BaseModel):
    source_content: str
    destination_content: str
    differences: List[Dict[str, Any]]
    has_differences: bool

class FileCompareResult(BaseModel):
    source_files: List[str]
    destination_files: List[str]
    added: List[str]
    removed: List[str]
    modified: List[str]

class CrawlJobStatus(BaseModel):
    job_id: str
    status: str
    pages_crawled: int = 0
    total_pages: int = 0
    current_url: Optional[str] = None
    files: List[str] = []
    errors: List[str] = []

# ============ SOURCE ENDPOINTS ============

@api_router.get("/sources", response_model=List[Source])
async def get_sources():
    sources = await db.sources.find({}, {"_id": 0}).to_list(100)
    return sources

@api_router.get("/sources/{source_id}", response_model=Source)
async def get_source(source_id: str):
    source = await db.sources.find_one({"id": source_id}, {"_id": 0})
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return source

@api_router.post("/sources", response_model=Source)
async def create_source(source_data: SourceCreate):
    source = Source(**source_data.model_dump())
    await db.sources.insert_one(source.model_dump())
    return source

@api_router.put("/sources/{source_id}", response_model=Source)
async def update_source(source_id: str, source_data: SourceCreate):
    existing = await db.sources.find_one({"id": source_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Source not found")
    
    updated_data = source_data.model_dump()
    updated_data["id"] = source_id
    updated_data["created_at"] = existing.get("created_at", datetime.now(timezone.utc).isoformat())
    updated_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    updated_data["last_crawl"] = existing.get("last_crawl")
    
    await db.sources.update_one({"id": source_id}, {"$set": updated_data})
    return updated_data

@api_router.delete("/sources/{source_id}")
async def delete_source(source_id: str):
    result = await db.sources.delete_one({"id": source_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"message": "Source deleted"}

# ============ DESTINATION ENDPOINTS ============

@api_router.get("/destinations", response_model=List[Destination])
async def get_destinations():
    destinations = await db.destinations.find({}, {"_id": 0}).to_list(100)
    for dest in destinations:
        dest["password"] = mask_password(dest.get("password", ""))
        dest["has_password"] = bool(dest.get("encrypted_password"))
    return destinations

@api_router.get("/destinations/{destination_id}", response_model=Destination)
async def get_destination(destination_id: str):
    destination = await db.destinations.find_one({"id": destination_id}, {"_id": 0})
    if not destination:
        raise HTTPException(status_code=404, detail="Destination not found")
    destination["password"] = mask_password(destination.get("password", ""))
    destination["has_password"] = bool(destination.get("encrypted_password"))
    return destination

@api_router.post("/destinations", response_model=Destination)
async def create_destination(destination_data: DestinationCreate):
    destination = Destination(**destination_data.model_dump())
    dest_dict = destination.model_dump()
    
    # Encrypt password
    if dest_dict.get("password"):
        dest_dict["encrypted_password"] = encrypt_password(dest_dict["password"])
        dest_dict["password"] = ""
    
    await db.destinations.insert_one(dest_dict)
    
    dest_dict["password"] = mask_password(destination_data.password)
    dest_dict["has_password"] = bool(destination_data.password)
    return dest_dict

@api_router.put("/destinations/{destination_id}", response_model=Destination)
async def update_destination(destination_id: str, destination_data: DestinationCreate):
    existing = await db.destinations.find_one({"id": destination_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Destination not found")
    
    updated_data = destination_data.model_dump()
    updated_data["id"] = destination_id
    updated_data["created_at"] = existing.get("created_at", datetime.now(timezone.utc).isoformat())
    updated_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    updated_data["last_deployment"] = existing.get("last_deployment")
    
    # Handle password
    if updated_data.get("password") and updated_data["password"] != "••••••••":
        updated_data["encrypted_password"] = encrypt_password(updated_data["password"])
        updated_data["password"] = ""
    else:
        updated_data["encrypted_password"] = existing.get("encrypted_password", "")
        updated_data["password"] = ""
    
    await db.destinations.update_one({"id": destination_id}, {"$set": updated_data})
    
    updated_data["password"] = mask_password("password")
    updated_data["has_password"] = bool(updated_data.get("encrypted_password"))
    return updated_data

@api_router.delete("/destinations/{destination_id}")
async def delete_destination(destination_id: str):
    result = await db.destinations.delete_one({"id": destination_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Destination not found")
    return {"message": "Destination deleted"}

# ============ DEPLOYMENT CONFIG ENDPOINTS ============

@api_router.get("/deployment-configs", response_model=List[DeploymentConfig])
async def get_deployment_configs():
    configs = await db.deployment_configs.find({}, {"_id": 0}).to_list(100)
    
    # Enrich with source/destination names
    for config in configs:
        source = await db.sources.find_one({"id": config.get("source_id")}, {"_id": 0})
        destination = await db.destinations.find_one({"id": config.get("destination_id")}, {"_id": 0})
        config["source_name"] = source.get("name") if source else "Unknown"
        config["destination_name"] = destination.get("name") if destination else "Unknown"
    
    return configs

@api_router.get("/deployment-configs/{config_id}", response_model=DeploymentConfig)
async def get_deployment_config(config_id: str):
    config = await db.deployment_configs.find_one({"id": config_id}, {"_id": 0})
    if not config:
        raise HTTPException(status_code=404, detail="Deployment config not found")
    
    source = await db.sources.find_one({"id": config.get("source_id")}, {"_id": 0})
    destination = await db.destinations.find_one({"id": config.get("destination_id")}, {"_id": 0})
    config["source_name"] = source.get("name") if source else "Unknown"
    config["destination_name"] = destination.get("name") if destination else "Unknown"
    
    return config

@api_router.post("/deployment-configs", response_model=DeploymentConfig)
async def create_deployment_config(config_data: DeploymentConfigCreate):
    # Validate source and destination exist
    source = await db.sources.find_one({"id": config_data.source_id}, {"_id": 0})
    if not source:
        raise HTTPException(status_code=400, detail="Source not found")
    
    destination = await db.destinations.find_one({"id": config_data.destination_id}, {"_id": 0})
    if not destination:
        raise HTTPException(status_code=400, detail="Destination not found")
    
    config = DeploymentConfig(
        **config_data.model_dump(),
        source_name=source.get("name"),
        destination_name=destination.get("name")
    )
    await db.deployment_configs.insert_one(config.model_dump())
    return config

@api_router.put("/deployment-configs/{config_id}", response_model=DeploymentConfig)
async def update_deployment_config(config_id: str, config_data: DeploymentConfigCreate):
    existing = await db.deployment_configs.find_one({"id": config_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deployment config not found")
    
    # Validate source and destination
    source = await db.sources.find_one({"id": config_data.source_id}, {"_id": 0})
    if not source:
        raise HTTPException(status_code=400, detail="Source not found")
    
    destination = await db.destinations.find_one({"id": config_data.destination_id}, {"_id": 0})
    if not destination:
        raise HTTPException(status_code=400, detail="Destination not found")
    
    updated_data = config_data.model_dump()
    updated_data["id"] = config_id
    updated_data["created_at"] = existing.get("created_at", datetime.now(timezone.utc).isoformat())
    updated_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    updated_data["last_run"] = existing.get("last_run")
    updated_data["source_name"] = source.get("name")
    updated_data["destination_name"] = destination.get("name")
    
    await db.deployment_configs.update_one({"id": config_id}, {"$set": updated_data})
    return updated_data

@api_router.delete("/deployment-configs/{config_id}")
async def delete_deployment_config(config_id: str):
    result = await db.deployment_configs.delete_one({"id": config_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Deployment config not found")
    return {"message": "Deployment config deleted"}

# ============ CRAWLER ============

async def crawl_website(job_id: str, source: dict):
    """Background task to crawl a WordPress website"""
    import requests
    from bs4 import BeautifulSoup
    from urllib.parse import urljoin, urlparse
    
    crawl_jobs[job_id] = {
        "status": "running",
        "pages_crawled": 0,
        "total_pages": 0,
        "current_url": None,
        "files": [],
        "errors": []
    }
    
    base_url = source["url"].rstrip("/")
    visited = set()
    to_visit = [base_url + source.get("root_path", "/")]
    files_saved = []
    
    crawl_dir = Path(f"/tmp/crawl_{job_id}")
    crawl_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        while to_visit and len(visited) < 500:
            url = to_visit.pop(0)
            if url in visited:
                continue
            
            visited.add(url)
            crawl_jobs[job_id]["current_url"] = url
            crawl_jobs[job_id]["pages_crawled"] = len(visited)
            crawl_jobs[job_id]["total_pages"] = len(visited) + len(to_visit)
            
            try:
                response = requests.get(url, timeout=30, headers={
                    "User-Agent": "Staticify-Crawler/1.0"
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
                        
                        if parsed.netloc == urlparse(base_url).netloc:
                            clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                            if clean_url not in visited and clean_url not in to_visit:
                                to_visit.append(clean_url)
                    
                    # Download assets
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
                                    crawl_jobs[job_id]["errors"].append(f"Failed to download {asset_url}: {str(e)}")
                    
                    # Save HTML
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
        
        await db.sources.update_one(
            {"id": source["id"]},
            {"$set": {"last_crawl": datetime.now(timezone.utc).isoformat()}}
        )
        
    except Exception as e:
        crawl_jobs[job_id]["status"] = "failed"
        crawl_jobs[job_id]["errors"].append(f"Crawl failed: {str(e)}")

@api_router.post("/crawler/start/{source_id}")
async def start_crawler(source_id: str, background_tasks: BackgroundTasks):
    source = await db.sources.find_one({"id": source_id}, {"_id": 0})
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    
    job_id = str(uuid.uuid4())
    crawl_jobs[job_id] = {
        "status": "pending",
        "pages_crawled": 0,
        "total_pages": 0,
        "current_url": None,
        "files": [],
        "errors": [],
        "source_id": source_id
    }
    
    background_tasks.add_task(crawl_website, job_id, source)
    return {"job_id": job_id, "status": "started"}

@api_router.get("/crawler/status/{job_id}")
async def get_crawler_status(job_id: str):
    if job_id not in crawl_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = crawl_jobs[job_id]
    return CrawlJobStatus(job_id=job_id, **{k: v for k, v in job.items() if k != "source_id"})

# ============ DEPLOYMENT ============

async def deploy_via_ftp(history_id: str, destination: dict, job_id: str):
    """Deploy files via FTP"""
    import ftplib
    
    logs = []
    files_deployed = 0
    files_failed = 0
    
    deployment_logs[history_id] = logs
    
    try:
        logs.append(f"[INFO] Connecting to {destination['host']}:{destination['port']} via FTP...")
        
        password = decrypt_password(destination.get("encrypted_password", ""))
        if not password and destination.get("password"):
            password = destination["password"]
        
        ftp = ftplib.FTP()
        ftp.connect(destination["host"], destination["port"], timeout=30)
        ftp.login(destination["username"], password)
        
        logs.append("[SUCCESS] Connected successfully")
        
        try:
            ftp.cwd(destination["root_path"])
            logs.append(f"[INFO] Changed to directory: {destination['root_path']}")
        except Exception:
            logs.append(f"[WARNING] Could not change to {destination['root_path']}")
        
        crawl_dir = Path(f"/tmp/crawl_{job_id}")
        if not crawl_dir.exists():
            logs.append("[ERROR] Crawl directory not found")
            await db.deployment_history.update_one(
                {"id": history_id},
                {"$set": {"status": "failed", "error_message": "Crawl directory not found", "logs": logs, "completed_at": datetime.now(timezone.utc).isoformat()}}
            )
            return
        
        for file_path in crawl_dir.rglob("*"):
            if file_path.is_file():
                relative_path = file_path.relative_to(crawl_dir)
                remote_path = str(relative_path)
                
                try:
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
                    
                    with open(file_path, "rb") as f:
                        ftp.storbinary(f"STOR {remote_path}", f)
                    
                    files_deployed += 1
                    logs.append(f"[SUCCESS] Uploaded: {remote_path}")
                    
                except Exception as e:
                    files_failed += 1
                    logs.append(f"[ERROR] Failed: {remote_path} - {str(e)}")
        
        ftp.quit()
        logs.append(f"[INFO] Complete. {files_deployed} uploaded, {files_failed} failed")
        
        status = "success" if files_failed == 0 else "partial"
        
        await db.deployment_history.update_one(
            {"id": history_id},
            {"$set": {"status": status, "files_deployed": files_deployed, "files_failed": files_failed, "logs": logs, "completed_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        await db.destinations.update_one(
            {"id": destination["id"]},
            {"$set": {"last_deployment": datetime.now(timezone.utc).isoformat()}}
        )
        
    except Exception as e:
        logs.append(f"[ERROR] Deployment failed: {str(e)}")
        await db.deployment_history.update_one(
            {"id": history_id},
            {"$set": {"status": "failed", "error_message": str(e), "logs": logs, "completed_at": datetime.now(timezone.utc).isoformat()}}
        )

async def deploy_via_sftp(history_id: str, destination: dict, job_id: str):
    """Deploy files via SFTP"""
    import paramiko
    
    logs = []
    files_deployed = 0
    files_failed = 0
    
    deployment_logs[history_id] = logs
    
    try:
        logs.append(f"[INFO] Connecting to {destination['host']}:{destination['port']} via SFTP...")
        
        password = decrypt_password(destination.get("encrypted_password", ""))
        if not password and destination.get("password"):
            password = destination["password"]
        
        transport = paramiko.Transport((destination["host"], destination["port"]))
        transport.connect(username=destination["username"], password=password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        
        logs.append("[SUCCESS] Connected successfully")
        
        crawl_dir = Path(f"/tmp/crawl_{job_id}")
        if not crawl_dir.exists():
            logs.append("[ERROR] Crawl directory not found")
            await db.deployment_history.update_one(
                {"id": history_id},
                {"$set": {"status": "failed", "error_message": "Crawl directory not found", "logs": logs, "completed_at": datetime.now(timezone.utc).isoformat()}}
            )
            return
        
        remote_root = destination["root_path"]
        
        for file_path in crawl_dir.rglob("*"):
            if file_path.is_file():
                relative_path = file_path.relative_to(crawl_dir)
                remote_path = f"{remote_root}/{relative_path}"
                
                try:
                    dirs = str(relative_path.parent).split("/")
                    current = remote_root
                    for d in dirs:
                        if d and d != ".":
                            current = f"{current}/{d}"
                            try:
                                sftp.mkdir(current)
                            except Exception:
                                pass
                    
                    sftp.put(str(file_path), remote_path)
                    files_deployed += 1
                    logs.append(f"[SUCCESS] Uploaded: {relative_path}")
                    
                except Exception as e:
                    files_failed += 1
                    logs.append(f"[ERROR] Failed: {relative_path} - {str(e)}")
        
        sftp.close()
        transport.close()
        logs.append(f"[INFO] Complete. {files_deployed} uploaded, {files_failed} failed")
        
        status = "success" if files_failed == 0 else "partial"
        
        await db.deployment_history.update_one(
            {"id": history_id},
            {"$set": {"status": status, "files_deployed": files_deployed, "files_failed": files_failed, "logs": logs, "completed_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        await db.destinations.update_one(
            {"id": destination["id"]},
            {"$set": {"last_deployment": datetime.now(timezone.utc).isoformat()}}
        )
        
    except Exception as e:
        logs.append(f"[ERROR] Deployment failed: {str(e)}")
        await db.deployment_history.update_one(
            {"id": history_id},
            {"$set": {"status": "failed", "error_message": str(e), "logs": logs, "completed_at": datetime.now(timezone.utc).isoformat()}}
        )

@api_router.post("/deploy/{config_id}")
async def start_deployment(config_id: str, background_tasks: BackgroundTasks, job_id: Optional[str] = None):
    config = await db.deployment_configs.find_one({"id": config_id}, {"_id": 0})
    if not config:
        raise HTTPException(status_code=404, detail="Deployment config not found")
    
    source = await db.sources.find_one({"id": config["source_id"]}, {"_id": 0})
    destination = await db.destinations.find_one({"id": config["destination_id"]}, {"_id": 0})
    
    if not source:
        raise HTTPException(status_code=400, detail="Source not found")
    if not destination:
        raise HTTPException(status_code=400, detail="Destination not found")
    
    if not job_id:
        for jid, job in crawl_jobs.items():
            if job.get("status") == "completed" and job.get("source_id") == source["id"]:
                job_id = jid
                break
    
    if not job_id:
        raise HTTPException(status_code=400, detail="No crawl job found. Please crawl the source first.")
    
    history = DeploymentHistory(
        deployment_config_id=config_id,
        deployment_name=config["name"],
        source_name=source["name"],
        destination_name=destination["name"],
        status="deploying"
    )
    
    await db.deployment_history.insert_one(history.model_dump())
    
    await db.deployment_configs.update_one(
        {"id": config_id},
        {"$set": {"last_run": datetime.now(timezone.utc).isoformat()}}
    )
    
    if destination["protocol"] == "sftp":
        background_tasks.add_task(deploy_via_sftp, history.id, destination, job_id)
    else:
        background_tasks.add_task(deploy_via_ftp, history.id, destination, job_id)
    
    return {"deployment_id": history.id, "status": "started"}

@api_router.get("/deploy/logs/{deployment_id}")
async def get_deployment_logs(deployment_id: str):
    deployment = await db.deployment_history.find_one({"id": deployment_id}, {"_id": 0})
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return deployment

# ============ HISTORY ============

@api_router.get("/history", response_model=List[DeploymentHistory])
async def get_deployment_history(limit: int = 50):
    history = await db.deployment_history.find({}, {"_id": 0}).sort("started_at", -1).to_list(limit)
    return history

@api_router.get("/history/config/{config_id}", response_model=List[DeploymentHistory])
async def get_config_history(config_id: str, limit: int = 20):
    history = await db.deployment_history.find({"deployment_config_id": config_id}, {"_id": 0}).sort("started_at", -1).to_list(limit)
    return history

# ============ SCHEDULES ============

@api_router.get("/schedules", response_model=List[ScheduledDeployment])
async def get_schedules():
    schedules = await db.scheduled_deployments.find({}, {"_id": 0}).to_list(100)
    return schedules

@api_router.post("/schedules", response_model=ScheduledDeployment)
async def create_schedule(schedule_data: ScheduledDeploymentCreate):
    config = await db.deployment_configs.find_one({"id": schedule_data.deployment_config_id}, {"_id": 0})
    if not config:
        raise HTTPException(status_code=404, detail="Deployment config not found")
    
    schedule = ScheduledDeployment(
        deployment_config_id=schedule_data.deployment_config_id,
        deployment_name=config["name"],
        cron_expression=schedule_data.cron_expression,
        enabled=schedule_data.enabled
    )
    
    await db.scheduled_deployments.insert_one(schedule.model_dump())
    return schedule

@api_router.put("/schedules/{schedule_id}")
async def update_schedule(schedule_id: str, enabled: bool):
    result = await db.scheduled_deployments.update_one({"id": schedule_id}, {"$set": {"enabled": enabled}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"message": "Schedule updated"}

@api_router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str):
    result = await db.scheduled_deployments.delete_one({"id": schedule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"message": "Schedule deleted"}

# ============ COMPARISON ============

@api_router.post("/compare/content")
async def compare_content(request: CompareRequest):
    import requests
    import difflib
    
    config = await db.deployment_configs.find_one({"id": request.deployment_config_id}, {"_id": 0})
    if not config:
        raise HTTPException(status_code=404, detail="Deployment config not found")
    
    source = await db.sources.find_one({"id": config["source_id"]}, {"_id": 0})
    destination = await db.destinations.find_one({"id": config["destination_id"]}, {"_id": 0})
    
    source_url = f"{source['url'].rstrip('/')}{request.page_path}"
    dest_url = f"{destination['public_url'].rstrip('/')}{request.page_path}" if destination.get('public_url') else None
    
    try:
        source_response = requests.get(source_url, timeout=30)
        source_content = source_response.text if source_response.status_code == 200 else ""
    except Exception:
        source_content = ""
    
    dest_content = ""
    if dest_url:
        try:
            dest_response = requests.get(dest_url, timeout=30)
            dest_content = dest_response.text if dest_response.status_code == 200 else ""
        except Exception:
            pass
    
    source_lines = source_content.splitlines(keepends=True)
    dest_lines = dest_content.splitlines(keepends=True)
    
    differ = difflib.unified_diff(source_lines, dest_lines, lineterm='')
    diff_list = list(differ)
    
    differences = []
    for line in diff_list:
        if line.startswith('+') and not line.startswith('+++'):
            differences.append({"type": "added", "content": line[1:]})
        elif line.startswith('-') and not line.startswith('---'):
            differences.append({"type": "removed", "content": line[1:]})
    
    return CompareResult(
        source_content=source_content,
        destination_content=dest_content,
        differences=differences,
        has_differences=len(differences) > 0
    )

@api_router.post("/compare/files")
async def compare_files(request: CompareRequest):
    config = await db.deployment_configs.find_one({"id": request.deployment_config_id}, {"_id": 0})
    if not config:
        raise HTTPException(status_code=404, detail="Deployment config not found")
    
    source_files = []
    for job_id, job in crawl_jobs.items():
        if job.get("status") == "completed" and job.get("source_id") == config["source_id"]:
            source_files = job.get("files", [])
            break
    
    dest_files = []
    
    source_set = set(source_files)
    dest_set = set(dest_files)
    
    return FileCompareResult(
        source_files=source_files,
        destination_files=dest_files,
        added=list(source_set - dest_set),
        removed=list(dest_set - source_set),
        modified=[]
    )

# ============ STATS ============

@api_router.get("/stats")
async def get_stats():
    total_sources = await db.sources.count_documents({})
    total_destinations = await db.destinations.count_documents({})
    total_deployments = await db.deployment_configs.count_documents({})
    total_runs = await db.deployment_history.count_documents({})
    successful_runs = await db.deployment_history.count_documents({"status": "success"})
    failed_runs = await db.deployment_history.count_documents({"status": "failed"})
    scheduled_count = await db.scheduled_deployments.count_documents({"enabled": True})
    
    recent = await db.deployment_history.find({}, {"_id": 0}).sort("started_at", -1).to_list(5)
    
    return {
        "total_sources": total_sources,
        "total_destinations": total_destinations,
        "total_deployments": total_deployments,
        "total_runs": total_runs,
        "successful_runs": successful_runs,
        "failed_runs": failed_runs,
        "active_schedules": scheduled_count,
        "recent_activity": recent
    }

# ============ ROOT ============

@api_router.get("/")
async def root():
    return {"message": "Staticify API - WordPress to Static Deployer"}

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
