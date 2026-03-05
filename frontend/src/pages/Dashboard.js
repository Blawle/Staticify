import { useState, useEffect } from "react";
import axios from "axios";
import { format } from "date-fns";
import { 
  Globe, 
  Server,
  Link2,
  Rocket, 
  CheckCircle2, 
  XCircle, 
  Clock,
  ArrowRight,
  RefreshCw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, deploymentsRes] = await Promise.all([
        axios.get(`${API}/stats`),
        axios.get(`${API}/deployment-configs`)
      ]);
      setStats(statsRes.data);
      setDeployments(deploymentsRes.data);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getStatusIcon = (status) => {
    switch (status) {
      case "success": return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case "failed": return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-amber-500" />;
    }
  };

  const getStatusBadge = (status) => {
    const badges = { success: "badge-success", failed: "badge-error", running: "badge-warning", deploying: "badge-warning", crawling: "badge-warning", pending: "badge-neutral" };
    return badges[status] || "badge-neutral";
  };

  return (
    <div className="page-container">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="dashboard-title">Dashboard</h1>
          <p className="page-description">Overview of your WordPress to Static deployments</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} data-testid="refresh-dashboard-btn">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid" data-testid="stats-grid">
        <div className="stat-card card-hover">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Globe className="w-5 h-5 text-primary" />
            </div>
          </div>
          <div className="stat-value" data-testid="total-sources">{stats?.total_sources || 0}</div>
          <div className="stat-label">Sources</div>
        </div>

        <div className="stat-card card-hover">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Server className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          <div className="stat-value" data-testid="total-destinations">{stats?.total_destinations || 0}</div>
          <div className="stat-label">Destinations</div>
        </div>

        <div className="stat-card card-hover">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-amber-500" />
            </div>
          </div>
          <div className="stat-value" data-testid="total-deployments">{stats?.total_deployments || 0}</div>
          <div className="stat-label">Deployments</div>
        </div>

        <div className="stat-card card-hover">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          <div className="stat-value" data-testid="successful-runs">{stats?.successful_runs || 0}</div>
          <div className="stat-label">Successful Runs</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Deployments */}
        <Card className="lg:col-span-2 bg-card border-border card-hover">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-heading text-lg">Deployment Configurations</CardTitle>
            <Link to="/deployments">
              <Button variant="ghost" size="sm" data-testid="view-all-deployments-btn">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {deployments.length === 0 ? (
              <div className="empty-state py-8">
                <Link2 className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="empty-state-title">No deployments configured</p>
                <p className="empty-state-description">Create a deployment to link a source to a destination.</p>
                <Link to="/deployments">
                  <Button className="btn-primary-glow" data-testid="add-first-deployment-btn">
                    <Link2 className="w-4 h-4 mr-2" />
                    Create Deployment
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {deployments.slice(0, 4).map((deployment) => (
                  <div key={deployment.id} className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg" data-testid={`deployment-item-${deployment.id}`}>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Globe className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="text-sm truncate">{deployment.source_name}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Server className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span className="text-sm truncate">{deployment.destination_name}</span>
                    </div>
                    <Link to={`/deploy?config=${deployment.id}`}>
                      <Button size="sm" variant="outline">
                        <Rocket className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="bg-card border-border card-hover">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-heading text-lg">Recent Activity</CardTitle>
            <Link to="/history">
              <Button variant="ghost" size="sm" data-testid="view-all-history-btn">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {!stats?.recent_activity || stats.recent_activity.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No recent activity
              </div>
            ) : (
              <div className="activity-list">
                {stats.recent_activity.map((activity) => (
                  <div key={activity.id} className="activity-item" data-testid={`activity-item-${activity.id}`}>
                    <div className={`activity-icon ${activity.status}`}>
                      {getStatusIcon(activity.status)}
                    </div>
                    <div className="activity-details">
                      <p className="activity-title">{activity.deployment_name}</p>
                      <p className="activity-time">
                        {format(new Date(activity.started_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <span className={getStatusBadge(activity.status)}>
                      {activity.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="mt-6 bg-card border-border">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link to="/sources">
              <Button variant="outline" data-testid="quick-add-source-btn">
                <Globe className="w-4 h-4 mr-2" />
                Add Source
              </Button>
            </Link>
            <Link to="/destinations">
              <Button variant="outline" data-testid="quick-add-destination-btn">
                <Server className="w-4 h-4 mr-2" />
                Add Destination
              </Button>
            </Link>
            <Link to="/deployments">
              <Button variant="outline" data-testid="quick-add-deployment-btn">
                <Link2 className="w-4 h-4 mr-2" />
                Create Deployment
              </Button>
            </Link>
            <Link to="/deploy">
              <Button className="btn-primary-glow" data-testid="quick-deploy-btn">
                <Rocket className="w-4 h-4 mr-2" />
                Run Deploy
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
