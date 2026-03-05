import { useState, useEffect } from "react";
import axios from "axios";
import { format } from "date-fns";
import { 
  Globe, 
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
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, profilesRes] = await Promise.all([
        axios.get(`${API}/stats`),
        axios.get(`${API}/profiles`)
      ]);
      setStats(statsRes.data);
      setProfiles(profilesRes.data);
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
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-amber-500" />;
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      success: "badge-success",
      failed: "badge-error",
      running: "badge-warning",
      pending: "badge-neutral"
    };
    return badges[status] || "badge-neutral";
  };

  return (
    <div className="page-container">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="dashboard-title">Dashboard</h1>
          <p className="page-description">Overview of your WordPress to Static deployments</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchData}
          data-testid="refresh-dashboard-btn"
        >
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
          <div className="stat-value" data-testid="total-sites">{stats?.total_sites || 0}</div>
          <div className="stat-label">Total Sites</div>
        </div>

        <div className="stat-card card-hover">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          <div className="stat-value" data-testid="successful-deploys">{stats?.successful_deployments || 0}</div>
          <div className="stat-label">Successful Deploys</div>
        </div>

        <div className="stat-card card-hover">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
          </div>
          <div className="stat-value" data-testid="failed-deploys">{stats?.failed_deployments || 0}</div>
          <div className="stat-label">Failed Deploys</div>
        </div>

        <div className="stat-card card-hover">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
          </div>
          <div className="stat-value" data-testid="active-schedules">{stats?.active_schedules || 0}</div>
          <div className="stat-label">Active Schedules</div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Site Profiles */}
        <Card className="lg:col-span-2 bg-card border-border card-hover">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-heading text-lg">Site Profiles</CardTitle>
            <Link to="/sites">
              <Button variant="ghost" size="sm" data-testid="view-all-sites-btn">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {profiles.length === 0 ? (
              <div className="empty-state py-8">
                <img 
                  src="https://images.unsplash.com/photo-1515879218367-8466d910aaa4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHwxfHxjb2RpbmclMjBzY3JlZW58ZW58MHx8fHwxNzcyNzMzMTU4fDA&ixlib=rb-4.1.0&q=85&w=400"
                  alt="Empty state"
                  className="empty-state-image"
                />
                <p className="empty-state-title">No sites configured</p>
                <p className="empty-state-description">Add your first WordPress site to start converting it to static.</p>
                <Link to="/sites">
                  <Button className="btn-primary-glow" data-testid="add-first-site-btn">
                    <Globe className="w-4 h-4 mr-2" />
                    Add Site Profile
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {profiles.slice(0, 4).map((profile) => (
                  <div 
                    key={profile.id} 
                    className="site-card"
                    data-testid={`site-card-${profile.id}`}
                  >
                    <div className="site-card-header">
                      <span className="site-card-name">{profile.name}</span>
                      {profile.last_deployment && (
                        <span className={getStatusBadge("success")}>Deployed</span>
                      )}
                    </div>
                    <div className="site-card-urls">
                      <div className="site-card-url">
                        <Globe className="w-3.5 h-3.5 text-primary" />
                        <code>{profile.wordpress_url}</code>
                      </div>
                      <div className="site-card-url">
                        <Rocket className="w-3.5 h-3.5 text-emerald-500" />
                        <code>{profile.external_host}</code>
                      </div>
                    </div>
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
                  <div 
                    key={activity.id} 
                    className="activity-item"
                    data-testid={`activity-item-${activity.id}`}
                  >
                    <div className={`activity-icon ${activity.status}`}>
                      {getStatusIcon(activity.status)}
                    </div>
                    <div className="activity-details">
                      <p className="activity-title">{activity.profile_name}</p>
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
            <Link to="/sites">
              <Button variant="outline" data-testid="quick-add-site-btn">
                <Globe className="w-4 h-4 mr-2" />
                Add New Site
              </Button>
            </Link>
            <Link to="/deploy">
              <Button className="btn-primary-glow" data-testid="quick-deploy-btn">
                <Rocket className="w-4 h-4 mr-2" />
                Deploy Now
              </Button>
            </Link>
            <Link to="/compare">
              <Button variant="outline" data-testid="quick-compare-btn">
                <Clock className="w-4 h-4 mr-2" />
                Compare Sites
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
