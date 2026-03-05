import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import {
  Rocket,
  Globe,
  Server,
  RefreshCw,
  Play,
  CheckCircle2,
  FileCode,
  ArrowRight,
  Link2
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
import { Link } from "react-router-dom";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Deploy() {
  const [searchParams] = useSearchParams();
  const [deployments, setDeployments] = useState([]);
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [selectedConfig, setSelectedConfig] = useState(null);
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
    fetchDeployments();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const configParam = searchParams.get("config");
    if (configParam && deployments.length > 0) {
      setSelectedConfigId(configParam);
    }
  }, [searchParams, deployments]);

  useEffect(() => {
    if (selectedConfigId) {
      const config = deployments.find(d => d.id === selectedConfigId);
      setSelectedConfig(config);
      // Reset states when changing config
      setCrawlJobId(null);
      setCrawlStatus(null);
      setDeploymentStatus(null);
      setDeploymentLogs([]);
    } else {
      setSelectedConfig(null);
    }
  }, [selectedConfigId, deployments]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [deploymentLogs]);

  const fetchDeployments = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/deployment-configs`);
      setDeployments(response.data);
      if (response.data.length > 0 && !selectedConfigId) {
        const configParam = searchParams.get("config");
        setSelectedConfigId(configParam || response.data[0].id);
      }
    } catch (error) {
      toast.error("Failed to fetch deployments");
    } finally {
      setLoading(false);
    }
  };

  const startCrawl = async () => {
    if (!selectedConfig) {
      toast.error("Please select a deployment");
      return;
    }

    try {
      setIsCrawling(true);
      setCrawlStatus(null);
      setDeploymentLogs([]);
      addLog("[INFO] Starting WordPress crawler...");

      const response = await axios.post(`${API}/crawler/start/${selectedConfig.source_id}`);
      setCrawlJobId(response.data.job_id);
      addLog(`[INFO] Crawl job started for source: ${selectedConfig.source_name}`);

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
            toast.success("Crawl completed");
          } else if (statusRes.data.status === "failed") {
            clearInterval(pollIntervalRef.current);
            setIsCrawling(false);
            addLog(`[ERROR] Crawl failed`);
            toast.error("Crawl failed");
          }
        } catch (error) {
          console.error("Poll error:", error);
        }
      }, 2000);

    } catch (error) {
      setIsCrawling(false);
      addLog(`[ERROR] Failed to start crawler: ${error.message}`);
      toast.error("Failed to start crawler");
    }
  };

  const startDeploy = async () => {
    if (!selectedConfig) {
      toast.error("Please select a deployment");
      return;
    }

    if (!crawlJobId || crawlStatus?.status !== "completed") {
      toast.error("Please complete the crawl first");
      return;
    }

    try {
      setIsDeploying(true);
      setDeploymentStatus(null);
      addLog(`[INFO] Starting deployment to: ${selectedConfig.destination_name}`);

      const response = await axios.post(`${API}/deploy/${selectedConfig.id}?job_id=${crawlJobId}`);
      setDeploymentId(response.data.deployment_id);
      addLog(`[INFO] Deployment started`);

      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await axios.get(`${API}/deploy/logs/${response.data.deployment_id}`);
          setDeploymentStatus(statusRes.data);
          
          if (statusRes.data.logs) {
            const currentLogCount = deploymentLogs.length;
            statusRes.data.logs.slice(currentLogCount).forEach(log => addLog(log));
          }

          if (statusRes.data.status === "success" || statusRes.data.status === "partial") {
            clearInterval(pollIntervalRef.current);
            setIsDeploying(false);
            toast.success(`Deployed ${statusRes.data.files_deployed} files`);
          } else if (statusRes.data.status === "failed") {
            clearInterval(pollIntervalRef.current);
            setIsDeploying(false);
            toast.error("Deployment failed");
          }
        } catch (error) {
          console.error("Poll error:", error);
        }
      }, 2000);

    } catch (error) {
      setIsDeploying(false);
      addLog(`[ERROR] Failed: ${error.response?.data?.detail || error.message}`);
      toast.error(error.response?.data?.detail || "Deployment failed");
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
        <h1 className="page-title" data-testid="deploy-title">Run Deployment</h1>
        <p className="page-description">Crawl a source and deploy static files to a destination</p>
      </div>

      {deployments.length === 0 && !loading ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12">
            <div className="empty-state">
              <Link2 className="w-16 h-16 text-muted-foreground mb-4" />
              <p className="empty-state-title">No deployments configured</p>
              <p className="empty-state-description">
                Create a deployment configuration first to link a source to a destination.
              </p>
              <Link to="/deployments">
                <Button className="btn-primary-glow">
                  <Link2 className="w-4 h-4 mr-2" />
                  Create Deployment
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration Panel */}
          <div className="lg:col-span-1 space-y-6">
            {/* Deployment Selection */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-amber-500" />
                  Select Deployment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={selectedConfigId} onValueChange={setSelectedConfigId} disabled={isCrawling || isDeploying}>
                  <SelectTrigger data-testid="deployment-select">
                    <SelectValue placeholder="Select a deployment" />
                  </SelectTrigger>
                  <SelectContent>
                    {deployments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedConfig && (
                  <div className="mt-4 p-3 bg-secondary/30 rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Globe className="w-4 h-4 text-primary" />
                      <span className="font-medium">Source:</span>
                      <span className="text-muted-foreground truncate">{selectedConfig.source_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Server className="w-4 h-4 text-emerald-500" />
                      <span className="font-medium">Destination:</span>
                      <span className="text-muted-foreground truncate">{selectedConfig.destination_name}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 1: Crawl */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-primary" />
                  Step 1: Crawl Source
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Crawl the WordPress source and convert to static HTML.
                </p>

                {crawlStatus && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-mono">{crawlStatus.pages_crawled} pages</span>
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

                <Button onClick={startCrawl} disabled={!selectedConfig || isCrawling || isDeploying} className="w-full" variant={crawlStatus?.status === "completed" ? "outline" : "default"} data-testid="start-crawl-btn">
                  {isCrawling ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Crawling...</>
                  ) : crawlStatus?.status === "completed" ? (
                    <><RefreshCw className="w-4 h-4 mr-2" />Re-crawl</>
                  ) : (
                    <><Play className="w-4 h-4 mr-2" />Start Crawl</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Step 2: Deploy */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <Rocket className="w-4 h-4 text-emerald-500" />
                  Step 2: Deploy to Destination
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload static files to the FTP/SFTP destination.
                </p>

                {deploymentStatus && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {deploymentStatus.status === "success" && <span className="badge-success">Success</span>}
                      {deploymentStatus.status === "failed" && <span className="badge-error">Failed</span>}
                      {deploymentStatus.status === "deploying" && <span className="badge-warning">Deploying</span>}
                    </div>
                    {deploymentStatus.files_deployed > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {deploymentStatus.files_deployed} files deployed
                      </p>
                    )}
                  </div>
                )}

                <Button onClick={startDeploy} disabled={!crawlJobId || crawlStatus?.status !== "completed" || isDeploying} className="w-full btn-primary-glow" data-testid="start-deploy-btn">
                  {isDeploying ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Deploying...</>
                  ) : (
                    <><Rocket className="w-4 h-4 mr-2" />Deploy Now</>
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
                <div className="terminal-log h-[600px] p-4 overflow-auto" data-testid="deployment-logs">
                  {deploymentLogs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      <p>Select a deployment and start the process...</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {deploymentLogs.map((log, index) => (
                        <div key={index} className={`${getLogClass(log.message)} font-mono text-xs leading-relaxed`}>
                          <span className="text-zinc-600 mr-2">[{new Date(log.time).toLocaleTimeString()}]</span>
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
      )}
    </div>
  );
}
