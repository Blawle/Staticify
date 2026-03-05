import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Globe,
  Server,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  FolderOpen,
  RefreshCw,
  X
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const initialFormState = {
  name: "",
  wordpress_url: "",
  wordpress_root: "/",
  external_host: "",
  external_port: 21,
  external_protocol: "ftp",
  external_username: "",
  external_password: "",
  external_root: "/public_html",
  external_url: ""
};

export default function SiteProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [formData, setFormData] = useState(initialFormState);
  const [saving, setSaving] = useState(false);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/profiles`);
      setProfiles(response.data);
    } catch (error) {
      toast.error("Failed to fetch profiles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ 
      ...prev, 
      [name]: value,
      external_port: name === "external_protocol" ? (value === "sftp" ? 22 : 21) : prev.external_port
    }));
  };

  const openCreateDialog = () => {
    setSelectedProfile(null);
    setFormData(initialFormState);
    setIsDialogOpen(true);
  };

  const openEditDialog = (profile) => {
    setSelectedProfile(profile);
    setFormData({
      name: profile.name,
      wordpress_url: profile.wordpress_url,
      wordpress_root: profile.wordpress_root,
      external_host: profile.external_host,
      external_port: profile.external_port,
      external_protocol: profile.external_protocol,
      external_username: profile.external_username,
      external_password: profile.external_password || "",
      external_root: profile.external_root,
      external_url: profile.external_url || ""
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.wordpress_url || !formData.external_host) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setSaving(true);
      if (selectedProfile) {
        await axios.put(`${API}/profiles/${selectedProfile.id}`, formData);
        toast.success("Profile updated successfully");
      } else {
        await axios.post(`${API}/profiles`, formData);
        toast.success("Profile created successfully");
      }
      setIsDialogOpen(false);
      fetchProfiles();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProfile) return;
    
    try {
      await axios.delete(`${API}/profiles/${selectedProfile.id}`);
      toast.success("Profile deleted successfully");
      setIsDeleteDialogOpen(false);
      setSelectedProfile(null);
      fetchProfiles();
    } catch (error) {
      toast.error("Failed to delete profile");
    }
  };

  const openDeleteDialog = (profile) => {
    setSelectedProfile(profile);
    setIsDeleteDialogOpen(true);
  };

  return (
    <div className="page-container">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="sites-title">Site Profiles</h1>
          <p className="page-description">Manage your WordPress site configurations</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchProfiles} data-testid="refresh-profiles-btn">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button className="btn-primary-glow" onClick={openCreateDialog} data-testid="add-profile-btn">
            <Plus className="w-4 h-4 mr-2" />
            Add Profile
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : profiles.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent>
            <div className="empty-state">
              <img
                src="https://images.unsplash.com/photo-1515879218367-8466d910aaa4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHwxfHxjb2RpbmclMjBzY3JlZW58ZW58MHx8fHwxNzcyNzMzMTU4fDA&ixlib=rb-4.1.0&q=85&w=400"
                alt="Empty state"
                className="empty-state-image"
              />
              <p className="empty-state-title">No site profiles yet</p>
              <p className="empty-state-description">
                Create your first site profile to start converting WordPress sites to static.
              </p>
              <Button className="btn-primary-glow" onClick={openCreateDialog} data-testid="create-first-profile-btn">
                <Plus className="w-4 h-4 mr-2" />
                Create First Profile
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {profiles.map((profile) => (
            <Card 
              key={profile.id} 
              className="bg-card border-border card-hover"
              data-testid={`profile-card-${profile.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Globe className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold">{profile.name}</CardTitle>
                      <span className={`text-xs ${profile.external_protocol === 'sftp' ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {profile.external_protocol.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(profile)}
                      data-testid={`edit-profile-${profile.id}-btn`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => openDeleteDialog(profile)}
                      data-testid={`delete-profile-${profile.id}-btn`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Globe className="w-3.5 h-3.5 text-primary" />
                    <span className="truncate font-mono text-xs">{profile.wordpress_url}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Server className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="truncate font-mono text-xs">{profile.external_host}:{profile.external_port}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                    <span className="truncate font-mono text-xs">{profile.external_root}</span>
                  </div>
                </div>
                
                {profile.last_deployment && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      Last deployed: {format(new Date(profile.last_deployment), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {selectedProfile ? "Edit Site Profile" : "Create Site Profile"}
            </DialogTitle>
            <DialogDescription>
              Configure your WordPress source and deployment target settings.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4 max-h-[60vh] overflow-y-auto">
            {/* Basic Info */}
            <div className="space-y-4">
              <h4 className="font-heading font-bold text-sm text-primary">Basic Information</h4>
              <div className="form-group">
                <Label htmlFor="name" className="form-label">Profile Name *</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="My WordPress Site"
                  data-testid="profile-name-input"
                />
              </div>
            </div>

            {/* WordPress Source */}
            <div className="space-y-4">
              <h4 className="font-heading font-bold text-sm text-primary flex items-center gap-2">
                <Globe className="w-4 h-4" />
                WordPress Source
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group col-span-2">
                  <Label htmlFor="wordpress_url" className="form-label">WordPress URL *</Label>
                  <Input
                    id="wordpress_url"
                    name="wordpress_url"
                    value={formData.wordpress_url}
                    onChange={handleInputChange}
                    placeholder="https://mysite.wordpress.com"
                    data-testid="wordpress-url-input"
                  />
                </div>
                <div className="form-group">
                  <Label htmlFor="wordpress_root" className="form-label">Root Path</Label>
                  <Input
                    id="wordpress_root"
                    name="wordpress_root"
                    value={formData.wordpress_root}
                    onChange={handleInputChange}
                    placeholder="/"
                    data-testid="wordpress-root-input"
                  />
                  <p className="form-hint">Starting path to crawl</p>
                </div>
              </div>
            </div>

            {/* External Host */}
            <div className="space-y-4">
              <h4 className="font-heading font-bold text-sm text-primary flex items-center gap-2">
                <Server className="w-4 h-4" />
                External Host (FTP/SFTP)
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <Label htmlFor="external_protocol" className="form-label">Protocol</Label>
                  <Select
                    value={formData.external_protocol}
                    onValueChange={(value) => handleSelectChange("external_protocol", value)}
                  >
                    <SelectTrigger data-testid="protocol-select">
                      <SelectValue placeholder="Select protocol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ftp">FTP</SelectItem>
                      <SelectItem value="sftp">SFTP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="form-group">
                  <Label htmlFor="external_port" className="form-label">Port</Label>
                  <Input
                    id="external_port"
                    name="external_port"
                    type="number"
                    value={formData.external_port}
                    onChange={handleInputChange}
                    placeholder="21"
                    data-testid="external-port-input"
                  />
                </div>
                <div className="form-group col-span-2">
                  <Label htmlFor="external_host" className="form-label">Host Address *</Label>
                  <Input
                    id="external_host"
                    name="external_host"
                    value={formData.external_host}
                    onChange={handleInputChange}
                    placeholder="ftp.example.com"
                    data-testid="external-host-input"
                  />
                </div>
                <div className="form-group">
                  <Label htmlFor="external_username" className="form-label">Username</Label>
                  <Input
                    id="external_username"
                    name="external_username"
                    value={formData.external_username}
                    onChange={handleInputChange}
                    placeholder="ftp_user"
                    data-testid="external-username-input"
                  />
                </div>
                <div className="form-group">
                  <Label htmlFor="external_password" className="form-label">Password</Label>
                  <Input
                    id="external_password"
                    name="external_password"
                    type="password"
                    value={formData.external_password}
                    onChange={handleInputChange}
                    placeholder="••••••••"
                    data-testid="external-password-input"
                  />
                </div>
                <div className="form-group">
                  <Label htmlFor="external_root" className="form-label">Root Directory</Label>
                  <Input
                    id="external_root"
                    name="external_root"
                    value={formData.external_root}
                    onChange={handleInputChange}
                    placeholder="/public_html"
                    data-testid="external-root-input"
                  />
                  <p className="form-hint">Where to deploy files</p>
                </div>
                <div className="form-group">
                  <Label htmlFor="external_url" className="form-label">External URL</Label>
                  <Input
                    id="external_url"
                    name="external_url"
                    value={formData.external_url}
                    onChange={handleInputChange}
                    placeholder="https://static.example.com"
                    data-testid="external-url-input"
                  />
                  <p className="form-hint">For comparison</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="cancel-profile-btn">
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saving}
              className="btn-primary-glow"
              data-testid="save-profile-btn"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              {selectedProfile ? "Update Profile" : "Create Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedProfile?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-delete-btn"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
