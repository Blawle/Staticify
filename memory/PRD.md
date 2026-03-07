# Staticify - WordPress to Static Site Deployer

## Product Overview
A self-hostable tool that converts internal WordPress websites to static HTML and deploys them to external web servers via FTP/SFTP, removing WordPress vulnerabilities.

## Core Requirements
- **Source Management**: Manage WordPress sites to crawl (no credentials needed - public pages only)
- **Destination Management**: Configure FTP/SFTP servers with AES-256 encrypted credentials
- **Deployment Configurations**: Link a Source to a Destination
- **Static Site Generation**: Crawl WordPress sites, rewrite links to relative paths, download all assets
- **Link Rewriting**: All internal links in generated static HTML are converted from absolute WordPress URLs to relative paths so they work on the deployed static site
- **Deployment via FTP/SFTP**: Upload crawled static files to destination servers
- **Scheduled Deployments**: Interval-based automated deployments using APScheduler
- **Deployment History**: Full logging of all deployment runs with status, file counts, and logs
- **Site Comparison**: Compare content and assets between source WordPress site and deployed static site
- **Proxmox LXC Deployment**: Scripts and guides for self-hosted deployment

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Scheduler**: APScheduler (AsyncIOScheduler with IntervalTrigger)
- **Security**: AES-256 encryption for FTP/SFTP passwords via `cryptography` library

## Data Model
- **sources**: `{ id, name, url, root_path, description, created_at, updated_at, last_crawl }`
- **destinations**: `{ id, name, host, port, protocol, username, encrypted_password, root_path, public_url, description }`
- **deployment_configs**: `{ id, name, source_id, destination_id, description, auto_crawl }`
- **deployment_history**: `{ id, deployment_config_id, deployment_name, source_name, destination_name, status, pages_crawled, files_deployed, files_failed, logs, error_message, started_at, completed_at }`
- **scheduled_deployments**: `{ id, deployment_config_id, deployment_name, interval_hours, enabled, last_run, next_run }`

## What's Implemented (as of March 7, 2026)
- [x] Sources CRUD (WordPress sites)
- [x] Destinations CRUD (FTP/SFTP with encrypted passwords)
- [x] Deployment Configs CRUD (linking source → destination)
- [x] WordPress Crawler with link rewriting (absolute → relative URLs)
- [x] Asset downloading (CSS, JS, images, srcset images)
- [x] CSS url() rewriting
- [x] FTP deployment
- [x] SFTP deployment
- [x] Deployment History with full logging
- [x] Interval-based Scheduled Deployments (APScheduler)
- [x] Content Comparison (visual diff between source and destination)
- [x] File Comparison (list files via FTP/SFTP and compare with crawled files)
- [x] Dashboard with stats and recent activity
- [x] Proxmox LXC deployment scripts
- [x] Legacy data migration handling (normalize_history_item)
- [x] Full test suite (30 backend tests, all passing)

## Backlog
- [ ] P1: Visual iframe-based comparison (render both sites side-by-side)
- [ ] P2: Selective page crawling (include/exclude patterns)
- [ ] P3: Email/webhook notifications on deployment completion
- [ ] P3: Deployment rollback capability
- [ ] P4: Multi-user support with authentication
- [ ] P4: Refactor server.py into modular structure (routers, models, services)
