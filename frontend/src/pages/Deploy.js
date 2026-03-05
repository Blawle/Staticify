import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Rocket,
  Globe,
  RefreshCw,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCode,
  Server
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Deploy() {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Crawl state
  const [crawlJobId, setCrawlJobId] = useState(null);
  const [crawlStatus, setCrawlStatus] = useState(null);
  const [isCrawling, setIsCrawling] = useState(false);
  
  // Deploy state
  const [deploymentId, setDeploymentId] = useState(null);
  const [deploymentStatus, setDeploymentStatus] = useState(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentLogs, setDeploymentLogs] = useState([]);
  
  const logsEndRef = useRef(null);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    fetchProfiles();
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedProfileId) {
      const profile = profiles.find(p => p.id === selectedProfileId);
      setSelectedProfile(profile);
    } else {
      setSelectedProfile(null);
    }
  }, [selectedProfileId, profiles]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [deploymentLogs]);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/profiles`);
      setProfiles(response.data);
      if (response.data.length > 0 && !selectedProfileId) {
        setSelectedProfileId(response.data[0].id);
      }
    } catch (error) {
      toast.error("Failed to fetch profiles");
    } finally {
      setLoading(false);
    }
  };

  const startCrawl = async () => {
    if (!selectedProfileId) {
      toast.error("Please select a site profile");
      return;
    }

    try {
      setIsCrawling(true);
      setCrawlStatus(null);
      setDeploymentLogs([]);
      addLog("[INFO] Starting WordPress crawler...");

      const response = await axios.post(`${API}/crawler/start/${selectedProfileId}`);
      setCrawlJobId(response.data.job_id);
      addLog(`[INFO] Crawl job started: ${response.data.job_id}`);

      // Poll for status
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await axios.get(`${API}/crawler/status/${response.data.job_id}`);
          setCrawlStatus(statusRes.data);
          
          if (statusRes.data.current_url) {
            addLog(`[INFO] Crawling: ${statusRes.data.current_url}`);
          }

          if (statusRes.data.status === "completed") {
            clearInterval(pollIntervalRef.current);
            setIsCrawling(false);
            addLog(`[SUCCESS] Crawl completed! ${statusRes.data.pages_crawled} pages, ${statusRes.data.files.length} files`);
            toast.success("Crawl completed successfully");
          } else if (statusRes.data.status === "failed") {
            clearInterval(pollIntervalRef.current);
            setIsCrawling(false);
            addLog(`[ERROR] Crawl failed`);
            statusRes.data.errors?.forEach(err => addLog(`[ERROR] ${err}`));
            toast.error("Crawl failed");
          }
        } catch (error) {
          console.error("Failed to poll crawl status:", error);
        }
      }, 2000);

    } catch (error) {
      setIsCrawling(false);
      addLog(`[ERROR] Failed to start crawler: ${error.message}`);
      toast.error("Failed to start crawler");
    }
  };

  const startDeploy = async () => {
    if (!selectedProfileId) {
      toast.error("Please select a site profile");
      return;
    }

    if (!crawlJobId || crawlStatus?.status !== "completed") {
      toast.error("Please complete the crawl first");
      return;
    }

    try {
      setIsDeploying(true);
      setDeploymentStatus(null);
      addLog("[INFO] Starting deployment...");

      const response = await axios.post(`${API}/deploy/${selectedProfileId}?job_id=${crawlJobId}`);
      setDeploymentId(response.data.deployment_id);
      addLog(`[INFO] Deployment started: ${response.data.deployment_id}`);

      // Poll for status
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await axios.get(`${API}/deploy/logs/${response.data.deployment_id}`);
          setDeploymentStatus(statusRes.data);
          
          // Add new logs
          if (statusRes.data.logs) {
            const currentLogCount = deploymentLogs.length;
            statusRes.data.logs.slice(currentLogCount).forEach(log => addLog(log));
          }

          if (statusRes.data.status === "success" || statusRes.data.status === "partial") {
            clearInterval(pollIntervalRef.current);
            setIsDeploying(false);
            toast.success(`Deployment completed! ${statusRes.data.files_deployed} files deployed`);
          } else if (statusRes.data.status === "failed") {
            clearInterval(pollIntervalRef.current);
            setIsDeploying(false);
            toast.error("Deployment failed");
          }
        } catch (error) {
          console.error("Failed to poll deployment status:", error);
        }
      }, 2000);

    } catch (error) {
      setIsDeploying(false);
      addLog(`[ERROR] Failed to start deployment: ${error.response?.data?.detail || error.message}`);
      toast.error(error.response?.data?.detail || "Failed to start deployment");
    }
  };

  const addLog = (message) => {
    setDeploymentLogs(prev => [...prev, { time: new Date().toISOString(), message }]);
  };

  const getLogClass = (message) => {
    if (message.includes("[SUCCESS]")) return "log-success";
    if (message.includes("[ERROR]")) return "log-error";
    if (message.includes("[WARNING]")) return "log-warning";
    return "log-info";
  };

  const getCrawlProgress = () => {
    if (!crawlStatus) return 0;
    if (crawlStatus.status === "completed") return 100;
    if (crawlStatus.total_pages === 0) return 0;
    return Math.min(99, (crawlStatus.pages_crawled / crawlStatus.total_pages) * 100);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title" data-testid="deploy-title">Deploy</h1>
        <p className="page-description">Crawl WordPress sites and deploy to static hosting</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="lg:col-span-1 space-y-6">
          {/* Site Selection */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-heading text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                Select Site
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedProfileId}
                onValueChange={setSelectedProfileId}
                disabled={isCrawling || isDeploying}
              >
                <SelectTrigger data-testid="site-select">
                  <SelectValue placeholder="Select a site profile" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedProfile && (
                <div className="mt-4 p-3 bg-secondary/50 rounded-lg space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Globe className="w-3.5 h-3.5" />
                    <span className="font-mono text-xs truncate">{selectedProfile.wordpress_url}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Server className="w-3.5 h-3.5" />
                    <span className="font-mono text-xs truncate">
                      {selectedProfile.external_protocol.toUpperCase()} → {selectedProfile.external_host}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 1: Crawl */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-heading text-base flex items-center gap-2">
                <FileCode className="w-4 h-4 text-amber-500" />
                Step 1: Crawl WordPress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Crawl your WordPress site and convert it to static HTML files.
              </p>

              {crawlStatus && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-mono">
                      {crawlStatus.pages_crawled} / {crawlStatus.total_pages || "?"} pages
                    </span>
                  </div>
                  <Progress value={getCrawlProgress()} className="h-2" />
                  {crawlStatus.status === "completed" && (
                    <div className="flex items-center gap-2 text-emerald-500 text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{crawlStatus.files.length} files ready</span>
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={startCrawl}
                disabled={!selectedProfileId || isCrawling || isDeploying}
                className="w-full"
                variant={crawlStatus?.status === "completed" ? "outline" : "default"}
                data-testid="start-crawl-btn"
              >
                {isCrawling ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Crawling...
                  </>
                ) : crawlStatus?.status === "completed" ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Re-crawl
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start Crawl
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Step 2: Deploy */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-heading text-base flex items-center gap-2">
                <Rocket className="w-4 h-4 text-primary" />
                Step 2: Deploy via {selectedProfile?.external_protocol?.toUpperCase() || "FTP"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload the static files to your external server.
              </p>

              {deploymentStatus && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {deploymentStatus.status === "success" && (
                      <span className="badge-success">Success</span>
                    )}
                    {deploymentStatus.status === "failed" && (
                      <span className="badge-error">Failed</span>
                    )}
                    {deploymentStatus.status === "running" && (
                      <span className="badge-warning">Running</span>
                    )}
                    {deploymentStatus.status === "partial" && (
                      <span className="badge-warning">Partial</span>
                    )}
                  </div>
                  {(deploymentStatus.status === "success" || deploymentStatus.status === "partial") && (
                    <p className="text-sm text-muted-foreground">
                      {deploymentStatus.files_deployed} files deployed
                      {deploymentStatus.files_failed > 0 && `, ${deploymentStatus.files_failed} failed`}
                    </p>
                  )}
                </div>
              )}

              <Button
                onClick={startDeploy}
                disabled={!crawlJobId || crawlStatus?.status !== "completed" || isDeploying}
                className="w-full btn-primary-glow"
                data-testid="start-deploy-btn"
              >
                {isDeploying ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4 mr-2" />
                    Deploy Now
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Logs Panel */}
        <div className="lg:col-span-2">
          <Card className="bg-card border-border h-full">
            <CardHeader className="border-b border-border">
              <CardTitle className="font-heading text-base flex items-center gap-2">
                <Server className="w-4 h-4" />
                Deployment Logs
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div 
                className="terminal-log h-[600px] p-4 overflow-auto"
                data-testid="deployment-logs"
              >
                {deploymentLogs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    <p>Logs will appear here when you start a crawl or deployment...</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {deploymentLogs.map((log, index) => (
                      <div 
                        key={index} 
                        className={`${getLogClass(log.message)} font-mono text-xs leading-relaxed`}
                      >
                        <span className="text-zinc-600 mr-2">
                          [{new Date(log.time).toLocaleTimeString()}]
                        </span>
                        {log.message}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
