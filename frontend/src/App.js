import "@/App.css";
import { BrowserRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { 
  LayoutDashboard, 
  Globe, 
  Server,
  Rocket, 
  FileDiff, 
  Clock, 
  History,
  Link2
} from "lucide-react";

// Pages
import Dashboard from "@/pages/Dashboard";
import Sources from "@/pages/Sources";
import Destinations from "@/pages/Destinations";
import Deployments from "@/pages/Deployments";
import Deploy from "@/pages/Deploy";
import Compare from "@/pages/Compare";
import Schedules from "@/pages/Schedules";
import DeploymentHistory from "@/pages/DeploymentHistory";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/sources", icon: Globe, label: "Sources", description: "WordPress sites" },
  { path: "/destinations", icon: Server, label: "Destinations", description: "FTP/SFTP hosts" },
  { path: "/deployments", icon: Link2, label: "Deployments", description: "Link source → destination" },
  { path: "/deploy", icon: Rocket, label: "Run Deploy" },
  { path: "/compare", icon: FileDiff, label: "Compare" },
  { path: "/schedules", icon: Clock, label: "Schedules" },
  { path: "/history", icon: History, label: "History" },
];

const Sidebar = () => {
  const location = useLocation();
  
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Rocket className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading font-bold text-base text-foreground">Staticify</h1>
            <p className="text-xs text-muted-foreground">WP → Static Deploy</p>
          </div>
        </div>
      </div>
      
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || 
            (item.path !== "/" && location.pathname.startsWith(item.path));
          
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
              data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
            >
              <Icon className="w-5 h-5 nav-icon" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground">
          <p>Self-hosted deployment</p>
          <p className="font-mono mt-1">v2.0.0</p>
        </div>
      </div>
    </aside>
  );
};

function App() {
  return (
    <div className="app-container tech-grid-bg">
      <BrowserRouter>
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sources" element={<Sources />} />
            <Route path="/destinations" element={<Destinations />} />
            <Route path="/deployments" element={<Deployments />} />
            <Route path="/deploy" element={<Deploy />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/schedules" element={<Schedules />} />
            <Route path="/history" element={<DeploymentHistory />} />
          </Routes>
        </main>
        <Toaster position="bottom-right" richColors />
      </BrowserRouter>
    </div>
  );
}

export default App;
