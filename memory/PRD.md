# WordPress to Static Deployer - Product Requirements Document

## Original Problem Statement
Build a self hostable tool that can be utilized to take an internal WordPress built website and deploy it to an external web server as a static website via FTP to remove the vulnerabilities that exist within WordPress instances. There should be the ability to compare both sites within the tool to determine differences. There should be an internal instance configuration as well as external host configuration. The configurations should include configuration of where the root directory is for the external, as well as internal, deployments of the website.

## User Choices
- Both FTP and SFTP protocol support
- Both visual diff (side-by-side preview) and file-based diff (list of changed/added/deleted files)
- Web crawler to convert WordPress pages to static HTML
- No authentication needed (local tool only)
- Multiple site profiles, scheduled deployments, and deployment history

## User Personas
1. **Web Developers**: Need to convert client WordPress sites to static for security
2. **System Administrators**: Manage multiple site deployments via FTP/SFTP
3. **WordPress Site Owners**: Want to reduce security vulnerabilities

## Core Requirements (Static)
- [x] Site profile management (CRUD operations)
- [x] WordPress crawler to generate static HTML
- [x] FTP deployment support
- [x] SFTP deployment support
- [x] Visual diff comparison (side-by-side)
- [x] File-based diff comparison
- [x] Scheduled deployments with cron expressions
- [x] Deployment history with logs
- [x] Internal/External root directory configuration

## Architecture
### Backend (FastAPI + MongoDB)
- **Models**: SiteProfile, DeploymentHistory, ScheduledDeployment
- **Services**: WordPress Crawler (BeautifulSoup), FTP Client (ftplib), SFTP Client (paramiko)
- **Endpoints**: /api/profiles, /api/crawler, /api/deploy, /api/compare, /api/schedules, /api/history

### Frontend (React + Shadcn UI)
- **Pages**: Dashboard, SiteProfiles, Deploy, Compare, Schedules, History
- **Theme**: Dark mode with Tactical Minimalism design
- **Components**: Terminal-style logs, Bento grid layout, Resizable diff panels

## What's Been Implemented (January 2026)
- [x] Complete backend API with all CRUD operations
- [x] WordPress crawler with recursive page/asset fetching
- [x] FTP deployment with directory creation
- [x] SFTP deployment with paramiko
- [x] Visual diff with side-by-side content comparison
- [x] File-based diff showing added/removed/modified files
- [x] Scheduled deployments with cron expression support
- [x] Deployment history with expandable logs
- [x] Dashboard with stats overview
- [x] Site profiles management with create/edit/delete
- [x] Real-time deployment logs in terminal style
- [x] Dark theme UI with professional design

## Prioritized Backlog
### P0 (Critical)
- All core features implemented ✅

### P1 (High Priority)
- [ ] Actual scheduled job execution (APScheduler integration)
- [ ] SSH key authentication for SFTP
- [ ] Webhook notifications on deployment completion

### P2 (Medium Priority)
- [ ] Incremental deployment (only changed files)
- [ ] Rollback functionality
- [ ] Multi-user support with authentication

### P3 (Nice to Have)
- [ ] WordPress plugin integration
- [ ] Cloud storage deployment (S3, GCS)
- [ ] Deployment preview before push

## Next Tasks
1. Implement APScheduler for actual scheduled job execution
2. Add SSH key authentication option for SFTP
3. Add deployment webhook/email notifications
4. Implement incremental deployment (hash-based file comparison)

## Security Update (January 2026)

### Password Encryption Implementation
- **Encryption**: AES-256 via Fernet (cryptography library)
- **Key Derivation**: PBKDF2-HMAC-SHA256 with 100,000 iterations
- **Storage**: Passwords stored in `encrypted_password` field, plain `external_password` field is always empty
- **Display**: Frontend shows masked "••••••••" and "Password encrypted" status
- **Decryption**: Only occurs server-side during FTP/SFTP connection

### Security Features
- [x] Passwords never returned in plain text to frontend
- [x] Encrypted at rest in MongoDB
- [x] Visual indicator showing encryption status on profile cards
- [x] Form shows "Stored encrypted using AES-256" notice
- [x] Legacy support for unencrypted passwords (auto-migration on deploy)
