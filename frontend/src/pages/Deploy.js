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
  Link2,
  Eye,
  ExternalLink,
  FolderOpen,
  FileText,
  X
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "react-router-dom";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getFileIcon(path) {
  if (path.endsWith(".html")) return "text-primary";
  if (path.endsWith(".css")) return "text-purple-400";
  if (path.endsWith(".js")) return "text-amber-400";
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico)$/.test(path)) return "text-emerald-400";
  return "text-muted-foreground";
}

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

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewFiles, setPreviewFiles] = useState([]);
  const [previewPath, setPreviewPath] = useState("index.html");

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
      setCrawlJobId(null);
      setCrawlStatus(null);
      setDeploymentStatus(null);
      setDeploymentLogs([]);
      setShowPreview(false);
      setPreviewFiles([]);
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
    if (!selectedConfig) return;
    try {
      setIsCrawling(true);
      setCrawlStatus(null);
      setDeploymentLogs([]);
      setShowPreview(false);
      setPreviewFiles([]);
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
            toast.success("Crawl completed — preview is now available");
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

  const openPreview = async () => {
    if (!crawlJobId) return;
    try {
      const res = await axios.get(`${API}/preview/${crawlJobId}/files`);
      setPreviewFiles(res.data.files || []);
      setPreviewPath("index.html");
      setShowPreview(true);
      addLog(`[INFO] Preview loaded — ${res.data.total} files available`);
    } catch (error) {
      toast.error("Failed to load preview files");
    }
  };

  const startDeploy = async () => {
    if (!selectedConfig || !crawlJobId || crawlStatus?.status !== "completed") return;
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

  const crawlComplete = crawlJobId && crawlStatus?.status === "completed";
  const previewUrl = crawlJobId ? `${API}/preview/${crawlJobId}/${previewPath}` : null;
  const htmlFiles = previewFiles.filter(f => f.path.endsWith(".html"));

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title" data-testid="deploy-title">Run Deployment</h1>
        <p className="page-description">Crawl, preview, then deploy static files to a destination</p>
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
        <>
          {/* Preview Modal */}
          {showPreview && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" data-testid="preview-modal">
              <div className="bg-card border border-border rounded-xl w-full max-w-[1400px] h-[85vh] flex flex-col overflow-hidden">
                {/* Preview Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <Eye className="w-5 h-5 text-cyan-400" />
                    <span className="font-heading font-bold text-sm">Static Site Preview</span>
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                      {previewFiles.length} files
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="sm" data-testid="preview-open-tab-btn">
                        <ExternalLink className="w-4 h-4 mr-1" /> Open in Tab
                      </Button>
                    </a>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowPreview(false)} data-testid="preview-close-btn">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {/* Preview Body */}
                <div className="flex flex-1 min-h-0">
                  {/* File sidebar */}
                  <div className="w-64 border-r border-border flex flex-col bg-background/50">
                    <div className="px-3 py-2 border-b border-border">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pages</span>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-2 space-y-0.5">
                        {htmlFiles.map((file) => (
                          <button
                            key={file.path}
                            onClick={() => setPreviewPath(file.path)}
                            className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-mono truncate transition-colors ${
                              previewPath === file.path
                                ? "bg-primary/15 text-primary"
                                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                            }`}
                            data-testid={`preview-file-${file.path}`}
                          >
                            <div className="flex items-center gap-2">
                              <FileText className={`w-3 h-3 flex-shrink-0 ${getFileIcon(file.path)}`} />
                              <span className="truncate">{file.path}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                      {previewFiles.filter(f => !f.path.endsWith(".html")).length > 0 && (
                        <>
                          <div className="px-3 py-2 border-t border-border mt-1">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assets</span>
                          </div>
                          <div className="p-2 space-y-0.5">
                            {previewFiles.filter(f => !f.path.endsWith(".html")).slice(0, 50).map((file) => (
                              <button
                                key={file.path}
                                onClick={() => setPreviewPath(file.path)}
                                className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-mono truncate transition-colors ${
                                  previewPath === file.path
                                    ? "bg-primary/15 text-primary"
                                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                                }`}
                              >
                                <div className="flex items-center gap-2 justify-between">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FolderOpen className={`w-3 h-3 flex-shrink-0 ${getFileIcon(file.path)}`} />
                                    <span className="truncate">{file.path.split('/').pop()}</span>
                                  </div>
                                  <span className="text-[10px] text-zinc-600 flex-shrink-0">{formatSize(file.size)}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </ScrollArea>
                  </div>
                  {/* iframe */}
                  <div className="flex-1 bg-white">
                    <iframe
                      key={previewPath}
                      src={previewUrl}
                      className="w-full h-full border-0"
                      title="Static Site Preview"
                      data-testid="preview-iframe"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

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

                  <Button onClick={startCrawl} disabled={!selectedConfig || isCrawling || isDeploying} className="w-full" variant={crawlComplete ? "outline" : "default"} data-testid="start-crawl-btn">
                    {isCrawling ? (
                      <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Crawling...</>
                    ) : crawlComplete ? (
                      <><RefreshCw className="w-4 h-4 mr-2" />Re-crawl</>
                    ) : (
                      <><Play className="w-4 h-4 mr-2" />Start Crawl</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Step 2: Preview */}
              <Card className={`border-border transition-all ${crawlComplete ? "bg-card" : "bg-card/50 opacity-60"}`}>
                <CardHeader>
                  <CardTitle className="font-heading text-base flex items-center gap-2">
                    <Eye className="w-4 h-4 text-cyan-400" />
                    Step 2: Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Browse the static site to verify links and layout before deploying.
                  </p>

                  <Button
                    onClick={openPreview}
                    disabled={!crawlComplete || isDeploying}
                    className="w-full"
                    variant="outline"
                    data-testid="open-preview-btn"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Open Preview
                  </Button>
                </CardContent>
              </Card>

              {/* Step 3: Deploy */}
              <Card className={`border-border transition-all ${crawlComplete ? "bg-card" : "bg-card/50 opacity-60"}`}>
                <CardHeader>
                  <CardTitle className="font-heading text-base flex items-center gap-2">
                    <Rocket className="w-4 h-4 text-emerald-500" />
                    Step 3: Deploy to Destination
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

                  <Button onClick={startDeploy} disabled={!crawlComplete || isDeploying} className="w-full btn-primary-glow" data-testid="start-deploy-btn">
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
        </>
      )}
    </div>
  );
}
