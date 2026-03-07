#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class WPStaticDeployerAPITester:
    def __init__(self, base_url="https://ftp-static-sync.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_base = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.created_source_id = None
        self.created_destination_id = None
        self.created_deployment_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.api_base}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {method} {url}")
        if data:
            print(f"   Data: {json.dumps(data)}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"   ✅ Passed - Status: {response.status_code}")
                try:
                    result_data = response.json()
                    print(f"   Response: {json.dumps(result_data, indent=2)[:200]}...")
                    return success, result_data
                except:
                    return success, {}
            else:
                print(f"   ❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {json.dumps(error_data)}")
                except:
                    print(f"   Error: {response.text[:200]}")
                return False, {}

        except Exception as e:
            print(f"   ❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test(
            "Root API Endpoint",
            "GET",
            "",
            200
        )

    def test_stats_endpoint_empty(self):
        """Test stats endpoint returns correct structure initially"""
        success, response = self.run_test(
            "Stats Endpoint (Empty State)",
            "GET", 
            "stats",
            200
        )
        
        if success:
            expected_keys = ['total_sources', 'total_destinations', 'total_deployments', 'total_runs', 'successful_runs', 'failed_runs', 'active_schedules', 'recent_activity']
            for key in expected_keys:
                if key not in response:
                    print(f"   ❌ Missing key: {key}")
                    return False
            print(f"   ✅ All required stats keys present")
        
        return success

    def test_sources_empty(self):
        """Test sources endpoint returns empty array initially"""
        success, response = self.run_test(
            "Sources Endpoint (Empty State)",
            "GET",
            "sources", 
            200
        )
        
        if success and isinstance(response, list):
            print(f"   ✅ Returned list with {len(response)} sources")
        elif success:
            print(f"   ❌ Expected list, got {type(response)}")
            return False
            
        return success

    def test_destinations_empty(self):
        """Test destinations endpoint returns empty array initially"""
        success, response = self.run_test(
            "Destinations Endpoint (Empty State)",
            "GET",
            "destinations", 
            200
        )
        
        if success and isinstance(response, list):
            print(f"   ✅ Returned list with {len(response)} destinations")
        elif success:
            print(f"   ❌ Expected list, got {type(response)}")
            return False
            
        return success

    def test_deployment_configs_empty(self):
        """Test deployment-configs endpoint returns empty array initially"""
        success, response = self.run_test(
            "Deployment Configs Endpoint (Empty State)",
            "GET",
            "deployment-configs", 
            200
        )
        
        if success and isinstance(response, list):
            print(f"   ✅ Returned list with {len(response)} deployment configs")
        elif success:
            print(f"   ❌ Expected list, got {type(response)}")
            return False
            
        return success

    def test_create_source(self):
        """Test creating a new WordPress source"""
        source_data = {
            "name": "Test WordPress Site",
            "url": "https://test.wordpress.com",
            "root_path": "/",
            "description": "Test source for API validation"
        }
        
        success, response = self.run_test(
            "Create Source",
            "POST",
            "sources",
            200,
            data=source_data
        )
        
        if success and 'id' in response:
            self.created_source_id = response['id']
            print(f"   ✅ Source created with ID: {self.created_source_id}")
        
        return success

    def test_create_destination(self):
        """Test creating a new FTP/SFTP destination"""
        destination_data = {
            "name": "Test FTP Server",
            "host": "ftp.example.com",
            "port": 21,
            "protocol": "ftp",
            "username": "testuser",
            "password": "testpass123",
            "root_path": "/public_html",
            "public_url": "https://test.static.com",
            "description": "Test destination for API validation"
        }
        
        success, response = self.run_test(
            "Create Destination",
            "POST",
            "destinations",
            200,
            data=destination_data
        )
        
        if success and 'id' in response:
            self.created_destination_id = response['id']
            print(f"   ✅ Destination created with ID: {self.created_destination_id}")
            
            # Verify password is masked
            if 'password' in response and response['password'] == "••••••••":
                print(f"   ✅ Password properly masked in response")
            elif 'password' in response:
                print(f"   ❌ Password not masked: {response['password']}")
                return False
        
        return success

    def test_create_deployment_config(self):
        """Test creating a deployment configuration"""
        if not self.created_source_id or not self.created_destination_id:
            print("   ⚠️  Skipping - Missing source or destination ID")
            return True
            
        deployment_data = {
            "name": "Test Deployment",
            "source_id": self.created_source_id,
            "destination_id": self.created_destination_id,
            "description": "Test deployment configuration",
            "auto_crawl": True
        }
        
        success, response = self.run_test(
            "Create Deployment Config",
            "POST",
            "deployment-configs",
            200,
            data=deployment_data
        )
        
        if success and 'id' in response:
            self.created_deployment_id = response['id']
            print(f"   ✅ Deployment config created with ID: {self.created_deployment_id}")
            
            # Verify source and destination names are populated
            if 'source_name' in response and 'destination_name' in response:
                print(f"   ✅ Source/Destination names populated")
            else:
                print(f"   ❌ Missing source_name or destination_name in response")
                return False
        
        return success

    def test_get_source_by_id(self):
        """Test retrieving a specific source by ID"""
        if not self.created_source_id:
            print("   ⚠️  Skipping - No source ID available")
            return True
            
        return self.run_test(
            "Get Source by ID",
            "GET",
            f"sources/{self.created_source_id}",
            200
        )[0]

    def test_get_destination_by_id(self):
        """Test retrieving a specific destination by ID"""
        if not self.created_destination_id:
            print("   ⚠️  Skipping - No destination ID available")
            return True
            
        success, response = self.run_test(
            "Get Destination by ID",
            "GET",
            f"destinations/{self.created_destination_id}",
            200
        )
        
        if success and 'password' in response and response['password'] == "••••••••":
            print(f"   ✅ Password properly masked in GET response")
        elif success:
            print(f"   ❌ Password not masked in GET response")
            return False
            
        return success

    def test_get_deployment_config_by_id(self):
        """Test retrieving a specific deployment config by ID"""
        if not self.created_deployment_id:
            print("   ⚠️  Skipping - No deployment config ID available")
            return True
            
        return self.run_test(
            "Get Deployment Config by ID",
            "GET",
            f"deployment-configs/{self.created_deployment_id}",
            200
        )[0]

    def test_lists_after_creation(self):
        """Test list endpoints return the created items"""
        # Test sources list
        success1, sources = self.run_test(
            "Sources After Creation",
            "GET",
            "sources",
            200
        )
        
        if success1 and isinstance(sources, list) and len(sources) > 0:
            print(f"   ✅ Found {len(sources)} source(s)")
        elif success1:
            print(f"   ❌ Expected at least 1 source, got {len(sources) if isinstance(sources, list) else 'non-list'}")
            success1 = False
        
        # Test destinations list
        success2, destinations = self.run_test(
            "Destinations After Creation",
            "GET",
            "destinations",
            200
        )
        
        if success2 and isinstance(destinations, list) and len(destinations) > 0:
            print(f"   ✅ Found {len(destinations)} destination(s)")
        elif success2:
            print(f"   ❌ Expected at least 1 destination, got {len(destinations) if isinstance(destinations, list) else 'non-list'}")
            success2 = False
            
        # Test deployment configs list
        success3, deployments = self.run_test(
            "Deployment Configs After Creation",
            "GET",
            "deployment-configs",
            200
        )
        
        if success3 and isinstance(deployments, list) and len(deployments) > 0:
            print(f"   ✅ Found {len(deployments)} deployment config(s)")
        elif success3:
            print(f"   ❌ Expected at least 1 deployment config, got {len(deployments) if isinstance(deployments, list) else 'non-list'}")
            success3 = False
            
        return success1 and success2 and success3

    def test_schedules_empty(self):
        """Test schedules endpoint"""
        return self.run_test(
            "Schedules Endpoint (Empty State)",
            "GET",
            "schedules",
            200
        )

    def test_history_empty(self):
        """Test deployment history endpoint"""
        return self.run_test(
            "Deployment History (Empty State)", 
            "GET",
            "history",
            200
        )

    def test_crawler_endpoints(self):
        """Test crawler endpoints"""
        if not self.created_source_id:
            print("   ⚠️  Skipping crawler tests - No source ID available")
            return True

        # Start crawler - this will likely fail due to fake URL but should return proper structure
        success, response = self.run_test(
            "Start Crawler (Expected to work at API level)",
            "POST",
            f"crawler/start/{self.created_source_id}",
            200
        )
        
        if success and 'job_id' in response:
            job_id = response['job_id']
            print(f"   ✅ Crawler started with job_id: {job_id}")
            
            # Test crawler status endpoint
            status_success, status_response = self.run_test(
                "Get Crawler Status",
                "GET",
                f"crawler/status/{job_id}",
                200
            )
            
            if status_success and 'status' in status_response:
                print(f"   ✅ Crawler status: {status_response['status']}")
                return True
        
        return success

    def test_compare_endpoints(self):
        """Test comparison endpoints"""
        if not self.created_deployment_id:
            print("   ⚠️  Skipping compare tests - No deployment config ID available")
            return True

        compare_data = {
            "deployment_config_id": self.created_deployment_id,
            "page_path": "/"
        }

        # Test content comparison
        success1, _ = self.run_test(
            "Compare Content",
            "POST",
            "compare/content",
            200,
            data=compare_data
        )

        # Test file comparison  
        success2, _ = self.run_test(
            "Compare Files",
            "POST", 
            "compare/files",
            200,
            data=compare_data
        )

        return success1 and success2

    def test_invalid_endpoints(self):
        """Test some invalid endpoints return proper errors"""
        success1, _ = self.run_test(
            "Invalid Source ID",
            "GET",
            "sources/invalid-id",
            404
        )
        
        success2, _ = self.run_test(
            "Invalid Destination ID",
            "GET", 
            "destinations/invalid-id",
            404
        )
        
        success3, _ = self.run_test(
            "Invalid Deployment Config ID",
            "GET",
            "deployment-configs/invalid-id", 
            404
        )
        
        success4, _ = self.run_test(
            "Invalid Crawler Job ID",
            "GET", 
            "crawler/status/invalid-job-id",
            404
        )
        
        return success1 and success2 and success3 and success4

def main():
    """Run all API tests"""
    print("🚀 Starting WordPress to Static Deployer API Tests")
    print("=" * 60)
    
    tester = WPStaticDeployerAPITester()
    
    # Basic endpoint tests
    print("\n📡 BASIC ENDPOINT TESTS")
    print("-" * 40)
    
    tests = [
        tester.test_root_endpoint,
        tester.test_stats_endpoint_empty,
        tester.test_sources_empty,
        tester.test_destinations_empty,
        tester.test_deployment_configs_empty,
        tester.test_schedules_empty,
        tester.test_history_empty,
    ]
    
    for test in tests:
        test()

    # CRUD tests
    print("\n🏗️  CRUD TESTS")
    print("-" * 40)
    
    crud_tests = [
        tester.test_create_source,
        tester.test_create_destination,
        tester.test_create_deployment_config,
        tester.test_get_source_by_id,
        tester.test_get_destination_by_id,
        tester.test_get_deployment_config_by_id,
        tester.test_lists_after_creation,
    ]
    
    for test in crud_tests:
        test()

    # Advanced feature tests
    print("\n⚡ ADVANCED FEATURE TESTS")
    print("-" * 40)
    
    advanced_tests = [
        tester.test_crawler_endpoints,
        tester.test_compare_endpoints,
        tester.test_invalid_endpoints,
    ]
    
    for test in advanced_tests:
        test()
    
    # Summary
    print("\n" + "=" * 60)
    print(f"📊 FINAL RESULTS")
    print(f"   Tests Run: {tester.tests_run}")
    print(f"   Tests Passed: {tester.tests_passed}")
    print(f"   Success Rate: {(tester.tests_passed/tester.tests_run*100):.1f}%")
    
    if tester.tests_passed == tester.tests_run:
        print("   🎉 All tests passed!")
        return 0
    else:
        print("   ⚠️  Some tests failed - check logs above")
        return 1

if __name__ == "__main__":
    sys.exit(main())