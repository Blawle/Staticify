"""
Backend API Tests for WordPress to Static Deployer (Staticify)
Tests: Sources CRUD, Destinations CRUD, Deployment Configs CRUD, 
       Schedules, History, Compare, Stats, Crawler
"""

import pytest
import requests
import os
import uuid

# API base URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data prefixes for cleanup
TEST_PREFIX = "TEST_"


class TestRootAndStats:
    """Test root and stats endpoints"""
    
    def test_root_endpoint(self):
        """Test root API endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "message" in data
        print(f"✓ Root endpoint works: {data['message']}")
    
    def test_stats_endpoint(self):
        """Test stats endpoint returns proper structure"""
        response = requests.get(f"{BASE_URL}/api/stats")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Check required fields
        required_fields = ["total_sources", "total_destinations", "total_deployments", 
                          "total_runs", "successful_runs", "failed_runs", "active_schedules"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"✓ Stats: Sources={data['total_sources']}, Destinations={data['total_destinations']}, Deployments={data['total_deployments']}")


class TestSourcesCRUD:
    """Test Sources (WordPress sites) CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixture"""
        self.source_id = None
        yield
        # Cleanup
        if self.source_id:
            try:
                requests.delete(f"{BASE_URL}/api/sources/{self.source_id}")
            except Exception:
                pass
    
    def test_get_all_sources(self):
        """Test GET all sources"""
        response = requests.get(f"{BASE_URL}/api/sources")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"✓ GET /api/sources returned {len(response.json())} sources")
    
    def test_create_source(self):
        """Test CREATE source"""
        payload = {
            "name": f"{TEST_PREFIX}WordPress Site",
            "url": "https://example.wordpress.com",
            "root_path": "/",
            "description": "Test source for automation"
        }
        response = requests.post(f"{BASE_URL}/api/sources", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["name"] == payload["name"]
        assert data["url"] == payload["url"]
        assert "id" in data
        self.source_id = data["id"]
        
        # Verify persistence with GET
        get_response = requests.get(f"{BASE_URL}/api/sources/{self.source_id}")
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["name"] == payload["name"]
        print(f"✓ Created source: {data['name']} (ID: {self.source_id})")
    
    def test_update_source(self):
        """Test UPDATE source"""
        # First create
        payload = {
            "name": f"{TEST_PREFIX}Update Test Source",
            "url": "https://update.wordpress.com",
            "root_path": "/",
            "description": ""
        }
        create_response = requests.post(f"{BASE_URL}/api/sources", json=payload)
        assert create_response.status_code == 200
        self.source_id = create_response.json()["id"]
        
        # Update
        update_payload = {
            "name": f"{TEST_PREFIX}Updated Source Name",
            "url": "https://updated.wordpress.com",
            "root_path": "/blog",
            "description": "Updated description"
        }
        update_response = requests.put(f"{BASE_URL}/api/sources/{self.source_id}", json=update_payload)
        assert update_response.status_code == 200
        
        # Verify update persisted
        get_response = requests.get(f"{BASE_URL}/api/sources/{self.source_id}")
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["name"] == update_payload["name"]
        assert fetched["url"] == update_payload["url"]
        print(f"✓ Updated source successfully")
    
    def test_delete_source(self):
        """Test DELETE source"""
        # First create
        payload = {
            "name": f"{TEST_PREFIX}Delete Test Source",
            "url": "https://delete.wordpress.com",
            "root_path": "/",
            "description": ""
        }
        create_response = requests.post(f"{BASE_URL}/api/sources", json=payload)
        assert create_response.status_code == 200
        source_id = create_response.json()["id"]
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/sources/{source_id}")
        assert delete_response.status_code == 200
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/sources/{source_id}")
        assert get_response.status_code == 404
        print(f"✓ Deleted source successfully")
    
    def test_get_nonexistent_source(self):
        """Test GET nonexistent source returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/sources/{fake_id}")
        assert response.status_code == 404
        print(f"✓ Nonexistent source returns 404")


class TestDestinationsCRUD:
    """Test Destinations (FTP/SFTP servers) CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixture"""
        self.destination_id = None
        yield
        # Cleanup
        if self.destination_id:
            try:
                requests.delete(f"{BASE_URL}/api/destinations/{self.destination_id}")
            except Exception:
                pass
    
    def test_get_all_destinations(self):
        """Test GET all destinations"""
        response = requests.get(f"{BASE_URL}/api/destinations")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"✓ GET /api/destinations returned {len(response.json())} destinations")
    
    def test_create_destination_ftp(self):
        """Test CREATE FTP destination with password encryption"""
        payload = {
            "name": f"{TEST_PREFIX}FTP Server",
            "host": "ftp.example.com",
            "port": 21,
            "protocol": "ftp",
            "username": "testuser",
            "password": "secretpassword123",
            "root_path": "/public_html",
            "public_url": "https://static.example.com",
            "description": "Test FTP destination"
        }
        response = requests.post(f"{BASE_URL}/api/destinations", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["name"] == payload["name"]
        assert data["host"] == payload["host"]
        assert data["protocol"] == "ftp"
        assert "id" in data
        # Password should be masked in response
        assert data.get("password") != "secretpassword123", "Password should be masked"
        assert data.get("has_password") == True, "has_password should be True"
        
        self.destination_id = data["id"]
        print(f"✓ Created FTP destination with encrypted password")
    
    def test_create_destination_sftp(self):
        """Test CREATE SFTP destination"""
        payload = {
            "name": f"{TEST_PREFIX}SFTP Server",
            "host": "sftp.example.com",
            "port": 22,
            "protocol": "sftp",
            "username": "sftpuser",
            "password": "sftppassword",
            "root_path": "/var/www/html",
            "public_url": "",
            "description": "Test SFTP destination"
        }
        response = requests.post(f"{BASE_URL}/api/destinations", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["protocol"] == "sftp"
        assert data["port"] == 22
        self.destination_id = data["id"]
        print(f"✓ Created SFTP destination")
    
    def test_update_destination(self):
        """Test UPDATE destination"""
        # Create
        payload = {
            "name": f"{TEST_PREFIX}Update Dest",
            "host": "old.example.com",
            "port": 21,
            "protocol": "ftp",
            "username": "user",
            "password": "pass",
            "root_path": "/old",
            "public_url": "",
            "description": ""
        }
        create_response = requests.post(f"{BASE_URL}/api/destinations", json=payload)
        assert create_response.status_code == 200
        self.destination_id = create_response.json()["id"]
        
        # Update (not changing password)
        update_payload = {
            "name": f"{TEST_PREFIX}Updated Dest",
            "host": "new.example.com",
            "port": 22,
            "protocol": "sftp",
            "username": "newuser",
            "password": "••••••••",  # Masked password means keep existing
            "root_path": "/new",
            "public_url": "https://new.example.com",
            "description": "Updated"
        }
        update_response = requests.put(f"{BASE_URL}/api/destinations/{self.destination_id}", json=update_payload)
        assert update_response.status_code == 200
        
        # Verify
        get_response = requests.get(f"{BASE_URL}/api/destinations/{self.destination_id}")
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["host"] == "new.example.com"
        assert fetched["protocol"] == "sftp"
        print(f"✓ Updated destination successfully")
    
    def test_delete_destination(self):
        """Test DELETE destination"""
        payload = {
            "name": f"{TEST_PREFIX}Delete Dest",
            "host": "delete.example.com",
            "port": 21,
            "protocol": "ftp",
            "username": "user",
            "password": "",
            "root_path": "/",
            "public_url": "",
            "description": ""
        }
        create_response = requests.post(f"{BASE_URL}/api/destinations", json=payload)
        assert create_response.status_code == 200
        dest_id = create_response.json()["id"]
        
        delete_response = requests.delete(f"{BASE_URL}/api/destinations/{dest_id}")
        assert delete_response.status_code == 200
        
        get_response = requests.get(f"{BASE_URL}/api/destinations/{dest_id}")
        assert get_response.status_code == 404
        print(f"✓ Deleted destination successfully")


class TestDeploymentConfigsCRUD:
    """Test Deployment Configs (source → destination link) CRUD"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixture with source and destination"""
        # Create source
        source_payload = {
            "name": f"{TEST_PREFIX}Deploy Config Source",
            "url": "https://config.wordpress.com",
            "root_path": "/",
            "description": ""
        }
        source_res = requests.post(f"{BASE_URL}/api/sources", json=source_payload)
        self.source_id = source_res.json()["id"] if source_res.status_code == 200 else None
        
        # Create destination
        dest_payload = {
            "name": f"{TEST_PREFIX}Deploy Config Dest",
            "host": "config.example.com",
            "port": 21,
            "protocol": "ftp",
            "username": "user",
            "password": "",
            "root_path": "/",
            "public_url": "",
            "description": ""
        }
        dest_res = requests.post(f"{BASE_URL}/api/destinations", json=dest_payload)
        self.dest_id = dest_res.json()["id"] if dest_res.status_code == 200 else None
        
        self.config_id = None
        yield
        
        # Cleanup
        if self.config_id:
            try:
                requests.delete(f"{BASE_URL}/api/deployment-configs/{self.config_id}")
            except Exception:
                pass
        if self.dest_id:
            try:
                requests.delete(f"{BASE_URL}/api/destinations/{self.dest_id}")
            except Exception:
                pass
        if self.source_id:
            try:
                requests.delete(f"{BASE_URL}/api/sources/{self.source_id}")
            except Exception:
                pass
    
    def test_get_all_deployment_configs(self):
        """Test GET all deployment configs"""
        response = requests.get(f"{BASE_URL}/api/deployment-configs")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"✓ GET /api/deployment-configs returned {len(response.json())} configs")
    
    def test_create_deployment_config(self):
        """Test CREATE deployment config linking source and destination"""
        if not self.source_id or not self.dest_id:
            pytest.skip("Source or destination not created")
        
        payload = {
            "name": f"{TEST_PREFIX}Test Deployment",
            "source_id": self.source_id,
            "destination_id": self.dest_id,
            "description": "Test deployment config",
            "auto_crawl": True
        }
        response = requests.post(f"{BASE_URL}/api/deployment-configs", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["name"] == payload["name"]
        assert data["source_id"] == self.source_id
        assert data["destination_id"] == self.dest_id
        assert "source_name" in data
        assert "destination_name" in data
        
        self.config_id = data["id"]
        
        # Verify persistence
        get_response = requests.get(f"{BASE_URL}/api/deployment-configs/{self.config_id}")
        assert get_response.status_code == 200
        print(f"✓ Created deployment config: {data['name']}")
    
    def test_create_deployment_config_invalid_source(self):
        """Test CREATE deployment config with invalid source returns error"""
        payload = {
            "name": f"{TEST_PREFIX}Invalid Source",
            "source_id": str(uuid.uuid4()),  # Non-existent source
            "destination_id": self.dest_id or str(uuid.uuid4()),
            "description": "",
            "auto_crawl": True
        }
        response = requests.post(f"{BASE_URL}/api/deployment-configs", json=payload)
        assert response.status_code == 400
        print(f"✓ Invalid source returns 400")
    
    def test_update_deployment_config(self):
        """Test UPDATE deployment config"""
        if not self.source_id or not self.dest_id:
            pytest.skip("Source or destination not created")
        
        # Create
        payload = {
            "name": f"{TEST_PREFIX}Update Config",
            "source_id": self.source_id,
            "destination_id": self.dest_id,
            "description": "Original",
            "auto_crawl": True
        }
        create_res = requests.post(f"{BASE_URL}/api/deployment-configs", json=payload)
        assert create_res.status_code == 200
        self.config_id = create_res.json()["id"]
        
        # Update
        update_payload = {
            "name": f"{TEST_PREFIX}Updated Config",
            "source_id": self.source_id,
            "destination_id": self.dest_id,
            "description": "Updated description",
            "auto_crawl": False
        }
        update_res = requests.put(f"{BASE_URL}/api/deployment-configs/{self.config_id}", json=update_payload)
        assert update_res.status_code == 200
        
        # Verify
        get_res = requests.get(f"{BASE_URL}/api/deployment-configs/{self.config_id}")
        assert get_res.status_code == 200
        assert get_res.json()["name"] == update_payload["name"]
        print(f"✓ Updated deployment config")
    
    def test_delete_deployment_config(self):
        """Test DELETE deployment config"""
        if not self.source_id or not self.dest_id:
            pytest.skip("Source or destination not created")
        
        payload = {
            "name": f"{TEST_PREFIX}Delete Config",
            "source_id": self.source_id,
            "destination_id": self.dest_id,
            "description": "",
            "auto_crawl": True
        }
        create_res = requests.post(f"{BASE_URL}/api/deployment-configs", json=payload)
        assert create_res.status_code == 200
        config_id = create_res.json()["id"]
        
        delete_res = requests.delete(f"{BASE_URL}/api/deployment-configs/{config_id}")
        assert delete_res.status_code == 200
        
        get_res = requests.get(f"{BASE_URL}/api/deployment-configs/{config_id}")
        assert get_res.status_code == 404
        print(f"✓ Deleted deployment config")


class TestSchedules:
    """Test Scheduled Deployments (interval-based)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup with source, destination, and config"""
        # Create source
        source_res = requests.post(f"{BASE_URL}/api/sources", json={
            "name": f"{TEST_PREFIX}Schedule Source",
            "url": "https://schedule.wordpress.com",
            "root_path": "/",
            "description": ""
        })
        self.source_id = source_res.json()["id"] if source_res.status_code == 200 else None
        
        # Create destination
        dest_res = requests.post(f"{BASE_URL}/api/destinations", json={
            "name": f"{TEST_PREFIX}Schedule Dest",
            "host": "schedule.example.com",
            "port": 21,
            "protocol": "ftp",
            "username": "user",
            "password": "",
            "root_path": "/",
            "public_url": "",
            "description": ""
        })
        self.dest_id = dest_res.json()["id"] if dest_res.status_code == 200 else None
        
        # Create config
        if self.source_id and self.dest_id:
            config_res = requests.post(f"{BASE_URL}/api/deployment-configs", json={
                "name": f"{TEST_PREFIX}Schedule Config",
                "source_id": self.source_id,
                "destination_id": self.dest_id,
                "description": "",
                "auto_crawl": True
            })
            self.config_id = config_res.json()["id"] if config_res.status_code == 200 else None
        else:
            self.config_id = None
        
        self.schedule_id = None
        yield
        
        # Cleanup
        if self.schedule_id:
            try:
                requests.delete(f"{BASE_URL}/api/schedules/{self.schedule_id}")
            except Exception:
                pass
        if self.config_id:
            try:
                requests.delete(f"{BASE_URL}/api/deployment-configs/{self.config_id}")
            except Exception:
                pass
        if self.dest_id:
            try:
                requests.delete(f"{BASE_URL}/api/destinations/{self.dest_id}")
            except Exception:
                pass
        if self.source_id:
            try:
                requests.delete(f"{BASE_URL}/api/sources/{self.source_id}")
            except Exception:
                pass
    
    def test_get_all_schedules(self):
        """Test GET all schedules"""
        response = requests.get(f"{BASE_URL}/api/schedules")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"✓ GET /api/schedules returned {len(response.json())} schedules")
    
    def test_create_schedule(self):
        """Test CREATE schedule with interval_hours"""
        if not self.config_id:
            pytest.skip("Config not created")
        
        payload = {
            "deployment_config_id": self.config_id,
            "interval_hours": 24,  # Daily
            "enabled": True
        }
        response = requests.post(f"{BASE_URL}/api/schedules", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["deployment_config_id"] == self.config_id
        assert data["interval_hours"] == 24
        assert data["enabled"] == True
        assert "id" in data
        assert "deployment_name" in data
        
        self.schedule_id = data["id"]
        print(f"✓ Created schedule: {data['deployment_name']} (every {data['interval_hours']} hours)")
    
    def test_toggle_schedule(self):
        """Test enable/disable schedule"""
        if not self.config_id:
            pytest.skip("Config not created")
        
        # Create schedule
        create_res = requests.post(f"{BASE_URL}/api/schedules", json={
            "deployment_config_id": self.config_id,
            "interval_hours": 12,
            "enabled": True
        })
        assert create_res.status_code == 200
        self.schedule_id = create_res.json()["id"]
        
        # Disable
        disable_res = requests.put(f"{BASE_URL}/api/schedules/{self.schedule_id}?enabled=false")
        assert disable_res.status_code == 200
        
        # Verify disabled
        get_res = requests.get(f"{BASE_URL}/api/schedules")
        schedules = get_res.json()
        schedule = next((s for s in schedules if s["id"] == self.schedule_id), None)
        assert schedule is not None
        assert schedule["enabled"] == False
        
        # Enable
        enable_res = requests.put(f"{BASE_URL}/api/schedules/{self.schedule_id}?enabled=true")
        assert enable_res.status_code == 200
        print(f"✓ Toggle schedule enable/disable works")
    
    def test_delete_schedule(self):
        """Test DELETE schedule"""
        if not self.config_id:
            pytest.skip("Config not created")
        
        # Create
        create_res = requests.post(f"{BASE_URL}/api/schedules", json={
            "deployment_config_id": self.config_id,
            "interval_hours": 6,
            "enabled": True
        })
        assert create_res.status_code == 200
        schedule_id = create_res.json()["id"]
        
        # Delete
        delete_res = requests.delete(f"{BASE_URL}/api/schedules/{schedule_id}")
        assert delete_res.status_code == 200
        
        # Verify
        get_res = requests.get(f"{BASE_URL}/api/schedules")
        schedules = get_res.json()
        assert not any(s["id"] == schedule_id for s in schedules)
        print(f"✓ Deleted schedule successfully")
    
    def test_create_schedule_invalid_config(self):
        """Test CREATE schedule with invalid config returns 404"""
        payload = {
            "deployment_config_id": str(uuid.uuid4()),  # Non-existent
            "interval_hours": 24,
            "enabled": True
        }
        response = requests.post(f"{BASE_URL}/api/schedules", json=payload)
        assert response.status_code == 404
        print(f"✓ Invalid config returns 404")


class TestHistory:
    """Test Deployment History"""
    
    def test_get_history(self):
        """Test GET deployment history"""
        response = requests.get(f"{BASE_URL}/api/history")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert isinstance(response.json(), list)
        
        # Check structure if history exists
        history = response.json()
        if len(history) > 0:
            item = history[0]
            assert "id" in item
            assert "deployment_name" in item
            assert "status" in item
            assert "started_at" in item
        print(f"✓ GET /api/history returned {len(history)} items")
    
    def test_get_history_with_limit(self):
        """Test GET history with limit parameter"""
        response = requests.get(f"{BASE_URL}/api/history?limit=5")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        assert len(response.json()) <= 5
        print(f"✓ History with limit works")


class TestCompare:
    """Test Compare functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup with source, destination, and config"""
        # Create source
        source_res = requests.post(f"{BASE_URL}/api/sources", json={
            "name": f"{TEST_PREFIX}Compare Source",
            "url": "https://example.com",  # Real URL for comparison
            "root_path": "/",
            "description": ""
        })
        self.source_id = source_res.json()["id"] if source_res.status_code == 200 else None
        
        # Create destination
        dest_res = requests.post(f"{BASE_URL}/api/destinations", json={
            "name": f"{TEST_PREFIX}Compare Dest",
            "host": "compare.example.com",
            "port": 21,
            "protocol": "ftp",
            "username": "user",
            "password": "",
            "root_path": "/",
            "public_url": "https://example.org",
            "description": ""
        })
        self.dest_id = dest_res.json()["id"] if dest_res.status_code == 200 else None
        
        # Create config
        if self.source_id and self.dest_id:
            config_res = requests.post(f"{BASE_URL}/api/deployment-configs", json={
                "name": f"{TEST_PREFIX}Compare Config",
                "source_id": self.source_id,
                "destination_id": self.dest_id,
                "description": "",
                "auto_crawl": True
            })
            self.config_id = config_res.json()["id"] if config_res.status_code == 200 else None
        else:
            self.config_id = None
        
        yield
        
        # Cleanup
        if self.config_id:
            try:
                requests.delete(f"{BASE_URL}/api/deployment-configs/{self.config_id}")
            except Exception:
                pass
        if self.dest_id:
            try:
                requests.delete(f"{BASE_URL}/api/destinations/{self.dest_id}")
            except Exception:
                pass
        if self.source_id:
            try:
                requests.delete(f"{BASE_URL}/api/sources/{self.source_id}")
            except Exception:
                pass
    
    def test_compare_content(self):
        """Test compare content endpoint"""
        if not self.config_id:
            pytest.skip("Config not created")
        
        payload = {
            "deployment_config_id": self.config_id,
            "page_path": "/"
        }
        response = requests.post(f"{BASE_URL}/api/compare/content", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "source_content" in data
        assert "destination_content" in data
        assert "differences" in data
        assert "has_differences" in data
        print(f"✓ Compare content works, has_differences={data['has_differences']}")
    
    def test_compare_files(self):
        """Test compare files endpoint"""
        if not self.config_id:
            pytest.skip("Config not created")
        
        payload = {
            "deployment_config_id": self.config_id,
            "page_path": "/"
        }
        response = requests.post(f"{BASE_URL}/api/compare/files", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "source_files" in data
        assert "destination_files" in data
        assert "added" in data
        assert "removed" in data
        print(f"✓ Compare files works, source_files={len(data['source_files'])}")
    
    def test_compare_invalid_config(self):
        """Test compare with invalid config returns 404"""
        payload = {
            "deployment_config_id": str(uuid.uuid4()),
            "page_path": "/"
        }
        response = requests.post(f"{BASE_URL}/api/compare/content", json=payload)
        assert response.status_code == 404
        print(f"✓ Compare with invalid config returns 404")


class TestCrawler:
    """Test Crawler endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup with source"""
        source_res = requests.post(f"{BASE_URL}/api/sources", json={
            "name": f"{TEST_PREFIX}Crawler Source",
            "url": "https://httpbin.org",  # Use httpbin for reliable crawl testing
            "root_path": "/html",
            "description": ""
        })
        self.source_id = source_res.json()["id"] if source_res.status_code == 200 else None
        yield
        
        if self.source_id:
            try:
                requests.delete(f"{BASE_URL}/api/sources/{self.source_id}")
            except Exception:
                pass
    
    def test_start_crawler(self):
        """Test starting the crawler"""
        if not self.source_id:
            pytest.skip("Source not created")
        
        response = requests.post(f"{BASE_URL}/api/crawler/start/{self.source_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "job_id" in data
        assert data["status"] == "started"
        print(f"✓ Crawler started, job_id={data['job_id']}")
    
    def test_crawler_status(self):
        """Test getting crawler status"""
        if not self.source_id:
            pytest.skip("Source not created")
        
        # Start crawler
        start_res = requests.post(f"{BASE_URL}/api/crawler/start/{self.source_id}")
        assert start_res.status_code == 200
        job_id = start_res.json()["job_id"]
        
        # Check status
        status_res = requests.get(f"{BASE_URL}/api/crawler/status/{job_id}")
        assert status_res.status_code == 200
        
        data = status_res.json()
        assert "job_id" in data
        assert "status" in data
        assert "pages_crawled" in data
        print(f"✓ Crawler status: {data['status']}, pages_crawled={data['pages_crawled']}")
    
    def test_crawler_status_invalid_job(self):
        """Test crawler status with invalid job returns 404"""
        response = requests.get(f"{BASE_URL}/api/crawler/status/{uuid.uuid4()}")
        assert response.status_code == 404
        print(f"✓ Invalid job returns 404")


# Run tests with: pytest test_static_deployer.py -v --tb=short
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
