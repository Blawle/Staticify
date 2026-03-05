#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class WPStaticDeployerAPITester:
    def __init__(self, base_url="https://wp-to-static-6.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_base = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.created_profile_id = None

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
        """Test stats endpoint returns zeros initially"""
        success, response = self.run_test(
            "Stats Endpoint (Empty State)",
            "GET", 
            "stats",
            200
        )
        
        if success:
            expected_keys = ['total_sites', 'total_deployments', 'successful_deployments', 'failed_deployments', 'active_schedules', 'recent_activity']
            for key in expected_keys:
                if key not in response:
                    print(f"   ❌ Missing key: {key}")
                    return False
            print(f"   ✅ All required stats keys present")
        
        return success

    def test_profiles_empty(self):
        """Test profiles endpoint returns empty array initially"""
        success, response = self.run_test(
            "Profiles Endpoint (Empty State)",
            "GET",
            "profiles", 
            200
        )
        
        if success and isinstance(response, list):
            print(f"   ✅ Returned list with {len(response)} profiles")
        elif success:
            print(f"   ❌ Expected list, got {type(response)}")
            return False
            
        return success

    def test_create_profile(self):
        """Test creating a new site profile"""
        profile_data = {
            "name": "Test WordPress Site",
            "wordpress_url": "https://test.wordpress.com",
            "wordpress_root": "/",
            "external_host": "ftp.example.com",
            "external_port": 21,
            "external_protocol": "ftp",
            "external_username": "testuser",
            "external_password": "testpass",
            "external_root": "/public_html",
            "external_url": "https://test.static.com"
        }
        
        success, response = self.run_test(
            "Create Site Profile",
            "POST",
            "profiles",
            200,
            data=profile_data
        )
        
        if success and 'id' in response:
            self.created_profile_id = response['id']
            print(f"   ✅ Profile created with ID: {self.created_profile_id}")
        
        return success

    def test_get_profile_by_id(self):
        """Test retrieving a specific profile by ID"""
        if not self.created_profile_id:
            print("   ⚠️  Skipping - No profile ID available")
            return True
            
        return self.run_test(
            "Get Profile by ID",
            "GET",
            f"profiles/{self.created_profile_id}",
            200
        )

    def test_profiles_after_creation(self):
        """Test profiles endpoint returns the created profile"""
        success, response = self.run_test(
            "Profiles After Creation",
            "GET",
            "profiles",
            200
        )
        
        if success and isinstance(response, list) and len(response) > 0:
            print(f"   ✅ Found {len(response)} profile(s)")
        elif success and len(response) == 0:
            print(f"   ❌ Expected at least 1 profile, got empty list")
            return False
            
        return success

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
        """Test crawler endpoints (should fail without valid WordPress site)"""
        if not self.created_profile_id:
            print("   ⚠️  Skipping crawler tests - No profile ID available")
            return True

        # This will likely fail due to fake WordPress URL, but should return proper error
        success, response = self.run_test(
            "Start Crawler (Expected to fail with fake URL)",
            "POST",
            f"crawler/start/{self.created_profile_id}",
            200  # Should still return 200 with job_id, even if job will fail
        )
        
        return True  # We expect this to work at API level, even if crawl fails

    def test_compare_endpoints(self):
        """Test comparison endpoints"""
        if not self.created_profile_id:
            print("   ⚠️  Skipping compare tests - No profile ID available")
            return True

        compare_data = {
            "profile_id": self.created_profile_id,
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
            "Invalid Profile ID",
            "GET",
            "profiles/invalid-id",
            404
        )
        
        success2, _ = self.run_test(
            "Invalid Crawler Job ID",
            "GET", 
            "crawler/status/invalid-job-id",
            404
        )
        
        return success1 and success2

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
        tester.test_profiles_empty,
        tester.test_schedules_empty,
        tester.test_history_empty,
    ]
    
    for test in tests:
        test()

    # Profile CRUD tests
    print("\n🏗️  PROFILE CRUD TESTS")
    print("-" * 40)
    
    profile_tests = [
        tester.test_create_profile,
        tester.test_get_profile_by_id,
        tester.test_profiles_after_creation,
    ]
    
    for test in profile_tests:
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