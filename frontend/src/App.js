import "@/App.css";
import { BrowserRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { 
  LayoutDashboard, 
  Globe, 
  Rocket, 
  FileDiff, 
  Clock, 
  History,
  Settings,
  Server
} from "lucide-react";

// Pages
import Dashboard from "@/pages/Dashboard";
import SiteProfiles from "@/pages/SiteProfiles";
import Deploy from "@/pages/Deploy";
import Compare from "@/pages/Compare";
import Schedules from "@/pages/Schedules";
import DeploymentHistory from "@/pages/DeploymentHistory";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/sites", icon: Globe, label: "Site Profiles" },
  { path: "/deploy", icon: Rocket, label: "Deploy" },
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
            <Server className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading font-bold text-base text-foreground">WP Static</h1>
            <p className="text-xs text-muted-foreground">Deployment Tool</p>
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
          <p className="font-mono mt-1">v1.0.0</p>
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
            <Route path="/sites" element={<SiteProfiles />} />
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
