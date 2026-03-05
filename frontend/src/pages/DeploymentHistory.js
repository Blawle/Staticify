import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  History,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Globe,
  Server,
  FileText,
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function DeploymentHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/history`);
      setHistory(response.data);
    } catch (error) {
      toast.error("Failed to fetch history");
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "success": return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case "failed": return <XCircle className="w-5 h-5 text-red-500" />;
      case "deploying": case "crawling": return <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />;
      case "partial": return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      default: return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status) => {
    const badges = { success: "badge-success", failed: "badge-error", deploying: "badge-warning", crawling: "badge-warning", partial: "badge-warning", pending: "badge-neutral" };
    return badges[status] || "badge-neutral";
  };

  const getLogClass = (message) => {
    if (message.includes("[SUCCESS]")) return "log-success";
    if (message.includes("[ERROR]")) return "log-error";
    if (message.includes("[WARNING]")) return "log-warning";
    return "log-info";
  };

  return (
    <div className="page-container">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="history-title">Deployment History</h1>
          <p className="page-description">View logs and status of all deployment runs</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchHistory} data-testid="refresh-history-btn">
          <RefreshCw className="w-4 h-4 mr-2" />Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : history.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent>
            <div className="empty-state">
              <History className="w-16 h-16 text-muted-foreground mb-4" />
              <p className="empty-state-title">No deployment history</p>
              <p className="empty-state-description">Run a deployment to see history here.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {history.map((deployment) => (
            <Collapsible key={deployment.id} open={expandedId === deployment.id} onOpenChange={() => setExpandedId(expandedId === deployment.id ? null : deployment.id)}>
              <Card className="bg-card border-border card-hover" data-testid={`deployment-${deployment.id}`}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {getStatusIcon(deployment.status)}
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-heading font-bold">{deployment.deployment_name}</span>
                            <span className={getStatusBadge(deployment.status)}>{deployment.status}</span>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Globe className="w-3 h-3 text-primary" />
                              {deployment.source_name}
                            </span>
                            <ArrowRight className="w-3 h-3" />
                            <span className="flex items-center gap-1">
                              <Server className="w-3 h-3 text-emerald-500" />
                              {deployment.destination_name}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(deployment.started_at), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right text-sm">
                          <p className="text-muted-foreground">
                            <span className="text-emerald-500 font-medium">{deployment.files_deployed}</span> deployed
                            {deployment.files_failed > 0 && (
                              <span className="ml-2"><span className="text-red-500 font-medium">{deployment.files_failed}</span> failed</span>
                            )}
                          </p>
                        </div>
                        {expandedId === deployment.id ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="border-t border-border pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Deployment Logs</span>
                      </div>
                      
                      {deployment.error_message && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                          <p className="text-sm text-red-500">{deployment.error_message}</p>
                        </div>
                      )}
                      
                      <ScrollArea className="h-[300px]">
                        <div className="terminal-log rounded-lg p-4">
                          {deployment.logs && deployment.logs.length > 0 ? (
                            <div className="space-y-1">
                              {deployment.logs.map((log, index) => (
                                <div key={index} className={`${getLogClass(log)} font-mono text-xs leading-relaxed`}>{log}</div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No logs available</p>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {history.length > 0 && (
        <Card className="bg-card border-border mt-6">
          <CardHeader>
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-secondary/50 rounded-lg">
                <p className="text-2xl font-bold">{history.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Runs</p>
              </div>
              <div className="text-center p-4 bg-emerald-500/10 rounded-lg">
                <p className="text-2xl font-bold text-emerald-500">{history.filter(d => d.status === "success").length}</p>
                <p className="text-xs text-muted-foreground mt-1">Successful</p>
              </div>
              <div className="text-center p-4 bg-red-500/10 rounded-lg">
                <p className="text-2xl font-bold text-red-500">{history.filter(d => d.status === "failed").length}</p>
                <p className="text-xs text-muted-foreground mt-1">Failed</p>
              </div>
              <div className="text-center p-4 bg-amber-500/10 rounded-lg">
                <p className="text-2xl font-bold text-amber-500">{history.reduce((acc, d) => acc + (d.files_deployed || 0), 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">Files Deployed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
