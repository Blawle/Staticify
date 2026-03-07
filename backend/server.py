from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, HTMLResponse
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
import json
import base64
import re
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

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

# Scheduled Deployment (interval-based)
class ScheduledDeployment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    deployment_config_id: str
    deployment_name: str
    interval_hours: int = 24
    enabled: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_run: Optional[str] = None
    next_run: Optional[str] = None

class ScheduledDeploymentCreate(BaseModel):
    deployment_config_id: str
    interval_hours: int = 24
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

def rewrite_links(html_content: str, base_url: str, page_url: str) -> str:
    """Rewrite all internal links in HTML from absolute WordPress URLs to relative static paths."""
    from bs4 import BeautifulSoup
    
    parsed_base = urlparse(base_url)
    base_domain = parsed_base.netloc
    soup = BeautifulSoup(html_content, "lxml")
    
    def make_relative(url_str: str, from_page: str) -> str:
        """Convert an absolute URL to a relative path for static deployment."""
        if not url_str:
            return url_str
        
        parsed = urlparse(url_str)
        
        # Only rewrite URLs that point to the source WordPress domain
        if parsed.netloc and parsed.netloc != base_domain:
            return url_str
        
        # Get the path from the URL
        if parsed.netloc == base_domain:
            target_path = parsed.path
        elif not parsed.scheme and not parsed.netloc:
            # Already relative
            return url_str
        else:
            return url_str
        
        # Clean up the target path
        if not target_path or target_path == "/":
            target_path = "/index.html"
        elif target_path.endswith("/"):
            target_path = target_path + "index.html"
        elif "." not in target_path.split("/")[-1]:
            target_path = target_path + "/index.html"
        
        # Build relative path from current page to target
        from_parsed = urlparse(from_page)
        from_path = from_parsed.path
        if not from_path or from_path == "/":
            from_dir = "/"
        elif from_path.endswith("/"):
            from_dir = from_path
        else:
            from_dir = "/".join(from_path.split("/")[:-1]) + "/"
        
        # Calculate relative path
        from_parts = [p for p in from_dir.split("/") if p]
        target_parts = target_path.lstrip("/").split("/")
        
        # Find common prefix
        common = 0
        for i in range(min(len(from_parts), len(target_parts) - 1)):
            if from_parts[i] == target_parts[i]:
                common += 1
            else:
                break
        
        ups = len(from_parts) - common
        remaining = target_parts[common:]
        
        if ups == 0 and remaining:
            relative = "./".join([""] + remaining) if not remaining[0].startswith(".") else "/".join(remaining)
            relative = "/".join(remaining)
        else:
            relative = "/".join([".."] * ups + remaining)
        
        if not relative:
            relative = "index.html"
        
        # Preserve query string and fragment
        result = relative
        if parsed.query:
            result += "?" + parsed.query
        if parsed.fragment:
            result += "#" + parsed.fragment
        
        return result
    
    # Rewrite <a href>
    for tag in soup.find_all("a", href=True):
        href = tag["href"]
        parsed_href = urlparse(href)
        if parsed_href.netloc == base_domain or (not parsed_href.netloc and not parsed_href.scheme):
            if parsed_href.netloc == base_domain:
                tag["href"] = make_relative(href, page_url)
    
    # Rewrite <link href> (CSS, icons, etc)
    for tag in soup.find_all("link", href=True):
        href = tag["href"]
        parsed_href = urlparse(href)
        if parsed_href.netloc == base_domain:
            tag["href"] = make_relative(href, page_url)
    
    # Rewrite <script src>
    for tag in soup.find_all("script", src=True):
        src = tag["src"]
        parsed_src = urlparse(src)
        if parsed_src.netloc == base_domain:
            tag["src"] = make_relative(src, page_url)
    
    # Rewrite <img src> and <img srcset>
    for tag in soup.find_all("img"):
        if tag.get("src"):
            parsed_src = urlparse(tag["src"])
            if parsed_src.netloc == base_domain:
                tag["src"] = make_relative(tag["src"], page_url)
        if tag.get("srcset"):
            new_srcset_parts = []
            for part in tag["srcset"].split(","):
                part = part.strip()
                pieces = part.split()
                if pieces:
                    url_part = pieces[0]
                    parsed_src = urlparse(url_part)
                    if parsed_src.netloc == base_domain:
                        pieces[0] = make_relative(url_part, page_url)
                    new_srcset_parts.append(" ".join(pieces))
            tag["srcset"] = ", ".join(new_srcset_parts)
    
    # Rewrite <form action>
    for tag in soup.find_all("form", action=True):
        action = tag["action"]
        parsed_action = urlparse(action)
        if parsed_action.netloc == base_domain:
            tag["action"] = make_relative(action, page_url)
    
    # Rewrite <source src/srcset> in <picture>/<video>/<audio>
    for tag in soup.find_all("source"):
        for attr in ["src", "srcset"]:
            if tag.get(attr):
                parsed_src = urlparse(tag[attr])
                if parsed_src.netloc == base_domain:
                    tag[attr] = make_relative(tag[attr], page_url)
    
    return str(soup)


def rewrite_css_urls(css_content: str, css_url: str, base_url: str) -> str:
    """Rewrite url() references in CSS files to be relative."""
    parsed_base = urlparse(base_url)
    base_domain = parsed_base.netloc
    
    def replace_url(match):
        url_value = match.group(1).strip("'\"")
        parsed = urlparse(url_value)
        if parsed.netloc == base_domain:
            # Convert to relative from CSS file location
            return f'url({parsed.path})'
        return match.group(0)
    
    return re.sub(r'url\(([^)]+)\)', replace_url, css_content)


async def crawl_website(job_id: str, source: dict):
    """Background task to crawl a WordPress website with link rewriting."""
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
    parsed_base = urlparse(base_url)
    base_domain = parsed_base.netloc
    visited = set()
    to_visit = [base_url + source.get("root_path", "/")]
    files_saved = []
    downloaded_assets = set()
    
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
                        src = script.get("src", "")
                        if src and ("wp-includes" in src and "wp-emoji" in src):
                            script.decompose()
                    
                    # Remove WordPress admin bar
                    admin_bar = soup.find(id="wpadminbar")
                    if admin_bar:
                        admin_bar.decompose()
                    
                    # Find all internal links to crawl
                    for link in soup.find_all("a", href=True):
                        href = link["href"]
                        full_url = urljoin(url, href)
                        parsed = urlparse(full_url)
                        
                        if parsed.netloc == base_domain:
                            clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                            if clean_url not in visited and clean_url not in to_visit:
                                to_visit.append(clean_url)
                    
                    # Download and save assets (CSS, JS, images)
                    for tag in soup.find_all(["link", "script", "img"]):
                        src = tag.get("href") or tag.get("src")
                        if src:
                            asset_url = urljoin(url, src)
                            parsed_asset = urlparse(asset_url)
                            if parsed_asset.netloc == base_domain and asset_url not in downloaded_assets:
                                downloaded_assets.add(asset_url)
                                try:
                                    asset_response = requests.get(asset_url, timeout=30, headers={
                                        "User-Agent": "Staticify-Crawler/1.0"
                                    })
                                    if asset_response.status_code == 200:
                                        asset_path = parsed_asset.path.lstrip("/")
                                        if not asset_path:
                                            continue
                                        asset_file = crawl_dir / asset_path
                                        asset_file.parent.mkdir(parents=True, exist_ok=True)
                                        
                                        asset_ct = asset_response.headers.get("Content-Type", "")
                                        if "text/css" in asset_ct:
                                            # Rewrite CSS url() references
                                            css_content = rewrite_css_urls(asset_response.text, asset_url, base_url)
                                            with open(asset_file, "w", encoding="utf-8") as f:
                                                f.write(css_content)
                                        elif "text" in asset_ct or "javascript" in asset_ct or "json" in asset_ct:
                                            with open(asset_file, "w", encoding="utf-8") as f:
                                                f.write(asset_response.text)
                                        else:
                                            with open(asset_file, "wb") as f:
                                                f.write(asset_response.content)
                                        files_saved.append(asset_path)
                                except Exception as e:
                                    crawl_jobs[job_id]["errors"].append(f"Failed to download {asset_url}: {str(e)}")
                    
                    # Also grab srcset images
                    for img in soup.find_all("img", srcset=True):
                        for part in img["srcset"].split(","):
                            part = part.strip().split()[0]
                            img_url = urljoin(url, part)
                            parsed_img = urlparse(img_url)
                            if parsed_img.netloc == base_domain and img_url not in downloaded_assets:
                                downloaded_assets.add(img_url)
                                try:
                                    img_response = requests.get(img_url, timeout=30, headers={
                                        "User-Agent": "Staticify-Crawler/1.0"
                                    })
                                    if img_response.status_code == 200:
                                        img_path = parsed_img.path.lstrip("/")
                                        if img_path:
                                            img_file = crawl_dir / img_path
                                            img_file.parent.mkdir(parents=True, exist_ok=True)
                                            with open(img_file, "wb") as f:
                                                f.write(img_response.content)
                                            files_saved.append(img_path)
                                except Exception:
                                    pass
                    
                    # Rewrite links in HTML content
                    rewritten_html = rewrite_links(response.text, base_url, url)
                    
                    # Determine save path
                    parsed_url = urlparse(url)
                    page_path = parsed_url.path.lstrip("/")
                    if not page_path or page_path.endswith("/"):
                        page_path = (page_path or "") + "index.html"
                    elif not page_path.endswith(".html"):
                        page_path = page_path + "/index.html"
                    
                    html_file = crawl_dir / page_path
                    html_file.parent.mkdir(parents=True, exist_ok=True)
                    
                    with open(html_file, "w", encoding="utf-8") as f:
                        f.write(rewritten_html)
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

# ============ PREVIEW ============

import mimetypes

@api_router.get("/preview/{job_id}/files")
async def list_preview_files(job_id: str):
    """List all files available for preview from a completed crawl."""
    if job_id not in crawl_jobs:
        raise HTTPException(status_code=404, detail="Crawl job not found")
    if crawl_jobs[job_id]["status"] != "completed":
        raise HTTPException(status_code=400, detail="Crawl not yet completed")
    
    crawl_dir = Path(f"/tmp/crawl_{job_id}")
    if not crawl_dir.exists():
        raise HTTPException(status_code=404, detail="Crawl files not found")
    
    files = []
    for f in sorted(crawl_dir.rglob("*")):
        if f.is_file():
            rel = str(f.relative_to(crawl_dir))
            size = f.stat().st_size
            files.append({"path": rel, "size": size})
    
    return {"job_id": job_id, "files": files, "total": len(files)}


@api_router.get("/preview/{job_id}/{file_path:path}")
async def serve_preview_file(job_id: str, file_path: str):
    """Serve a single file from a completed crawl for preview."""
    if job_id not in crawl_jobs:
        raise HTTPException(status_code=404, detail="Crawl job not found")
    
    crawl_dir = Path(f"/tmp/crawl_{job_id}")
    
    # Default to index.html
    if not file_path or file_path == "/":
        file_path = "index.html"
    
    target = (crawl_dir / file_path).resolve()
    
    # Security: ensure path stays within crawl dir
    if not str(target).startswith(str(crawl_dir.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # If path is a directory, look for index.html inside it
    if target.is_dir():
        target = target / "index.html"
    
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    content_type, _ = mimetypes.guess_type(str(target))
    if not content_type:
        content_type = "application/octet-stream"
    
    return FileResponse(str(target), media_type=content_type)

# ============ HISTORY ============

def normalize_history_item(item: dict) -> dict:
    """Normalize legacy history items to new schema"""
    # Handle legacy fields from previous schema (profile_id/profile_name)
    if "deployment_config_id" not in item and "profile_id" in item:
        item["deployment_config_id"] = item.get("profile_id", "unknown")
    if "deployment_name" not in item and "profile_name" in item:
        item["deployment_name"] = item.get("profile_name", "Legacy Deployment")
    if "source_name" not in item:
        item["source_name"] = "Legacy Source"
    if "destination_name" not in item:
        item["destination_name"] = "Legacy Destination"
    # Ensure required fields have defaults
    item.setdefault("deployment_config_id", "unknown")
    item.setdefault("deployment_name", "Unknown")
    item.setdefault("source_name", "Unknown")
    item.setdefault("destination_name", "Unknown")
    item.setdefault("pages_crawled", 0)
    return item

@api_router.get("/history", response_model=List[DeploymentHistory])
async def get_deployment_history(limit: int = 50):
    history = await db.deployment_history.find({}, {"_id": 0}).sort("started_at", -1).to_list(limit)
    # Normalize legacy data
    history = [normalize_history_item(item) for item in history]
    return history

@api_router.get("/history/config/{config_id}", response_model=List[DeploymentHistory])
async def get_config_history(config_id: str, limit: int = 20):
    history = await db.deployment_history.find({"deployment_config_id": config_id}, {"_id": 0}).sort("started_at", -1).to_list(limit)
    history = [normalize_history_item(item) for item in history]
    return history

# ============ SCHEDULES ============

# Scheduler instance
scheduler = AsyncIOScheduler()

async def run_scheduled_deployment(schedule_id: str, config_id: str):
    """Execute a scheduled deployment: crawl then deploy."""
    try:
        config = await db.deployment_configs.find_one({"id": config_id}, {"_id": 0})
        if not config:
            logger.error(f"Schedule {schedule_id}: config {config_id} not found")
            return
        
        source = await db.sources.find_one({"id": config["source_id"]}, {"_id": 0})
        destination = await db.destinations.find_one({"id": config["destination_id"]}, {"_id": 0})
        
        if not source or not destination:
            logger.error(f"Schedule {schedule_id}: source or destination not found")
            return
        
        # Start crawl
        job_id = str(uuid.uuid4())
        crawl_jobs[job_id] = {
            "status": "pending",
            "pages_crawled": 0,
            "total_pages": 0,
            "current_url": None,
            "files": [],
            "errors": [],
            "source_id": source["id"]
        }
        
        logger.info(f"Schedule {schedule_id}: starting crawl for {source['name']}")
        await crawl_website(job_id, source)
        
        if crawl_jobs[job_id]["status"] != "completed":
            logger.error(f"Schedule {schedule_id}: crawl failed")
            # Record history
            history = DeploymentHistory(
                deployment_config_id=config_id,
                deployment_name=config["name"],
                source_name=source["name"],
                destination_name=destination["name"],
                status="failed",
                error_message="Scheduled crawl failed",
                logs=crawl_jobs[job_id].get("errors", [])
            )
            history_dict = history.model_dump()
            history_dict["completed_at"] = datetime.now(timezone.utc).isoformat()
            await db.deployment_history.insert_one(history_dict)
            return
        
        # Start deployment
        history = DeploymentHistory(
            deployment_config_id=config_id,
            deployment_name=config["name"],
            source_name=source["name"],
            destination_name=destination["name"],
            status="deploying",
            pages_crawled=crawl_jobs[job_id]["pages_crawled"]
        )
        await db.deployment_history.insert_one(history.model_dump())
        
        logger.info(f"Schedule {schedule_id}: starting deploy to {destination['name']}")
        if destination.get("protocol") == "sftp":
            await deploy_via_sftp(history.id, destination, job_id)
        else:
            await deploy_via_ftp(history.id, destination, job_id)
        
        # Update schedule last_run
        await db.scheduled_deployments.update_one(
            {"id": schedule_id},
            {"$set": {"last_run": datetime.now(timezone.utc).isoformat()}}
        )
        
        await db.deployment_configs.update_one(
            {"id": config_id},
            {"$set": {"last_run": datetime.now(timezone.utc).isoformat()}}
        )
        
        logger.info(f"Schedule {schedule_id}: completed")
        
    except Exception as e:
        logger.error(f"Schedule {schedule_id} failed: {e}")


def add_schedule_job(schedule_id: str, config_id: str, interval_hours: int):
    """Add a job to the APScheduler."""
    job_id = f"schedule_{schedule_id}"
    # Remove existing job if present
    try:
        scheduler.remove_job(job_id)
    except Exception:
        pass
    
    scheduler.add_job(
        run_scheduled_deployment,
        trigger=IntervalTrigger(hours=interval_hours),
        id=job_id,
        args=[schedule_id, config_id],
        replace_existing=True
    )


def remove_schedule_job(schedule_id: str):
    """Remove a job from the APScheduler."""
    try:
        scheduler.remove_job(f"schedule_{schedule_id}")
    except Exception:
        pass


@api_router.get("/schedules", response_model=List[ScheduledDeployment])
async def get_schedules():
    schedules = await db.scheduled_deployments.find({}, {"_id": 0}).to_list(100)
    # Enrich with next run info from scheduler
    for s in schedules:
        try:
            job = scheduler.get_job(f"schedule_{s['id']}")
            if job and job.next_run_time:
                s["next_run"] = job.next_run_time.isoformat()
        except Exception:
            pass
    return schedules

@api_router.post("/schedules", response_model=ScheduledDeployment)
async def create_schedule(schedule_data: ScheduledDeploymentCreate):
    config = await db.deployment_configs.find_one({"id": schedule_data.deployment_config_id}, {"_id": 0})
    if not config:
        raise HTTPException(status_code=404, detail="Deployment config not found")
    
    schedule = ScheduledDeployment(
        deployment_config_id=schedule_data.deployment_config_id,
        deployment_name=config["name"],
        interval_hours=schedule_data.interval_hours,
        enabled=schedule_data.enabled
    )
    
    await db.scheduled_deployments.insert_one(schedule.model_dump())
    
    if schedule.enabled:
        add_schedule_job(schedule.id, schedule.deployment_config_id, schedule.interval_hours)
    
    return schedule

@api_router.put("/schedules/{schedule_id}")
async def update_schedule(schedule_id: str, enabled: bool):
    schedule = await db.scheduled_deployments.find_one({"id": schedule_id}, {"_id": 0})
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    await db.scheduled_deployments.update_one({"id": schedule_id}, {"$set": {"enabled": enabled}})
    
    if enabled:
        add_schedule_job(schedule_id, schedule["deployment_config_id"], schedule.get("interval_hours", 24))
    else:
        remove_schedule_job(schedule_id)
    
    return {"message": "Schedule updated"}

@api_router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str):
    result = await db.scheduled_deployments.delete_one({"id": schedule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
    remove_schedule_job(schedule_id)
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
    
    if not source:
        raise HTTPException(status_code=400, detail="Source not found")
    if not destination:
        raise HTTPException(status_code=400, detail="Destination not found")
    
    source_url = f"{source['url'].rstrip('/')}{request.page_path}"
    dest_url = f"{destination['public_url'].rstrip('/')}{request.page_path}" if destination.get('public_url') else None
    
    try:
        source_response = requests.get(source_url, timeout=30, headers={"User-Agent": "Staticify-Crawler/1.0"})
        source_content = source_response.text if source_response.status_code == 200 else ""
    except Exception:
        source_content = ""
    
    dest_content = ""
    if dest_url:
        try:
            dest_response = requests.get(dest_url, timeout=30, headers={"User-Agent": "Staticify-Crawler/1.0"})
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
        source_content=source_content[:50000],
        destination_content=dest_content[:50000],
        differences=differences[:500],
        has_differences=len(differences) > 0
    )

@api_router.post("/compare/files")
async def compare_files(request: CompareRequest):
    config = await db.deployment_configs.find_one({"id": request.deployment_config_id}, {"_id": 0})
    if not config:
        raise HTTPException(status_code=404, detail="Deployment config not found")
    
    destination = await db.destinations.find_one({"id": config["destination_id"]}, {"_id": 0})
    
    # Get source files from the latest crawl
    source_files = []
    for job_id, job in crawl_jobs.items():
        if job.get("status") == "completed" and job.get("source_id") == config["source_id"]:
            source_files = job.get("files", [])
            break
    
    # Get destination files via FTP/SFTP if possible
    dest_files = []
    if destination:
        try:
            dest_files = await list_destination_files(destination)
        except Exception as e:
            logger.error(f"Failed to list destination files: {e}")
    
    source_set = set(source_files)
    dest_set = set(dest_files)
    
    # Files in source but not destination
    added = list(source_set - dest_set)
    # Files in destination but not source
    removed = list(dest_set - source_set)
    # Files in both (potentially modified)
    common = list(source_set & dest_set)
    
    return FileCompareResult(
        source_files=source_files,
        destination_files=dest_files,
        added=added,
        removed=removed,
        modified=common
    )


async def list_destination_files(destination: dict) -> List[str]:
    """List files on the destination server via FTP/SFTP."""
    password = decrypt_password(destination.get("encrypted_password", ""))
    if not password and destination.get("password"):
        password = destination["password"]
    
    files = []
    
    if destination.get("protocol") == "sftp":
        import paramiko
        try:
            transport = paramiko.Transport((destination["host"], destination["port"]))
            transport.connect(username=destination["username"], password=password)
            sftp = paramiko.SFTPClient.from_transport(transport)
            
            root = destination["root_path"]
            dirs_to_scan = [root]
            while dirs_to_scan:
                current = dirs_to_scan.pop(0)
                try:
                    for entry in sftp.listdir_attr(current):
                        full_path = f"{current}/{entry.filename}"
                        if entry.st_mode and (entry.st_mode & 0o40000):  # is directory
                            dirs_to_scan.append(full_path)
                        else:
                            rel = full_path[len(root):].lstrip("/")
                            if rel:
                                files.append(rel)
                except Exception:
                    pass
            
            sftp.close()
            transport.close()
        except Exception as e:
            logger.error(f"SFTP listing failed: {e}")
    else:
        import ftplib
        try:
            ftp = ftplib.FTP()
            ftp.connect(destination["host"], destination["port"], timeout=30)
            ftp.login(destination["username"], password)
            
            root = destination["root_path"]
            dirs_to_scan = [root]
            while dirs_to_scan:
                current = dirs_to_scan.pop(0)
                try:
                    ftp.cwd(current)
                    entries = []
                    ftp.retrlines('LIST', entries.append)
                    for entry in entries:
                        parts = entry.split(None, 8)
                        if len(parts) >= 9:
                            name = parts[8]
                            if name in (".", ".."):
                                continue
                            full_path = f"{current}/{name}"
                            if entry.startswith("d"):
                                dirs_to_scan.append(full_path)
                            else:
                                rel = full_path[len(root):].lstrip("/")
                                if rel:
                                    files.append(rel)
                except Exception:
                    pass
            
            ftp.quit()
        except Exception as e:
            logger.error(f"FTP listing failed: {e}")
    
    return files

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
    recent = [normalize_history_item(item) for item in recent]
    
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

@app.on_event("startup")
async def startup_event():
    """Start the scheduler and reload saved schedules."""
    scheduler.start()
    logger.info("APScheduler started")
    # Reload enabled schedules from database
    try:
        schedules = await db.scheduled_deployments.find({"enabled": True}, {"_id": 0}).to_list(100)
        for s in schedules:
            add_schedule_job(s["id"], s["deployment_config_id"], s.get("interval_hours", 24))
        logger.info(f"Loaded {len(schedules)} active schedules")
    except Exception as e:
        logger.error(f"Failed to load schedules: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown(wait=False)
    client.close()
