import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Server,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  ShieldCheck,
  FolderOpen
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  host: "",
  port: 21,
  protocol: "ftp",
  username: "",
  password: "",
  root_path: "/public_html",
  public_url: "",
  description: ""
};

export default function Destinations() {
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [formData, setFormData] = useState(initialFormState);
  const [saving, setSaving] = useState(false);

  const fetchDestinations = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/destinations`);
      setDestinations(response.data);
    } catch (error) {
      toast.error("Failed to fetch destinations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDestinations();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ 
      ...prev, 
      [name]: value,
      port: name === "protocol" ? (value === "sftp" ? 22 : 21) : prev.port
    }));
  };

  const openCreateDialog = () => {
    setSelectedDestination(null);
    setFormData(initialFormState);
    setIsDialogOpen(true);
  };

  const openEditDialog = (destination) => {
    setSelectedDestination(destination);
    setFormData({
      name: destination.name,
      host: destination.host,
      port: destination.port,
      protocol: destination.protocol,
      username: destination.username,
      password: "",
      root_path: destination.root_path,
      public_url: destination.public_url || "",
      description: destination.description || ""
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.host || !formData.username) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setSaving(true);
      if (selectedDestination) {
        await axios.put(`${API}/destinations/${selectedDestination.id}`, formData);
        toast.success("Destination updated successfully");
      } else {
        await axios.post(`${API}/destinations`, formData);
        toast.success("Destination created successfully");
      }
      setIsDialogOpen(false);
      fetchDestinations();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save destination");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDestination) return;
    
    try {
      await axios.delete(`${API}/destinations/${selectedDestination.id}`);
      toast.success("Destination deleted successfully");
      setIsDeleteDialogOpen(false);
      setSelectedDestination(null);
      fetchDestinations();
    } catch (error) {
      toast.error("Failed to delete destination");
    }
  };

  return (
    <div className="page-container">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="destinations-title">Destinations</h1>
          <p className="page-description">FTP/SFTP servers where static files will be deployed.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchDestinations} data-testid="refresh-destinations-btn">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button className="btn-primary-glow" onClick={openCreateDialog} data-testid="add-destination-btn">
            <Plus className="w-4 h-4 mr-2" />
            Add Destination
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-emerald-500/5 border-emerald-500/20 mb-6">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Server className="w-5 h-5 text-emerald-500 mt-0.5" />
            <div>
              <p className="font-medium text-sm">What is a Destination?</p>
              <p className="text-sm text-muted-foreground mt-1">
                A destination is an FTP or SFTP server where your static files will be uploaded. This is typically your web hosting server. Credentials are encrypted using AES-256 before storage.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : destinations.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent>
            <div className="empty-state">
              <Server className="w-16 h-16 text-muted-foreground mb-4" />
              <p className="empty-state-title">No destinations configured</p>
              <p className="empty-state-description">
                Add your first FTP/SFTP server to deploy static files.
              </p>
              <Button className="btn-primary-glow" onClick={openCreateDialog} data-testid="create-first-destination-btn">
                <Plus className="w-4 h-4 mr-2" />
                Add First Destination
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {destinations.map((dest) => (
            <Card key={dest.id} className="bg-card border-border card-hover" data-testid={`destination-card-${dest.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <Server className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold">{dest.name}</CardTitle>
                      <span className={`text-xs ${dest.protocol === 'sftp' ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {dest.protocol.toUpperCase()} Destination
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(dest)} data-testid={`edit-destination-${dest.id}-btn`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setSelectedDestination(dest); setIsDeleteDialogOpen(true); }} data-testid={`delete-destination-${dest.id}-btn`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Server className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="truncate font-mono text-xs">{dest.host}:{dest.port}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                    <span className="truncate font-mono text-xs">{dest.root_path}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-xs">
                      {dest.has_password ? (
                        <span className="text-emerald-500">Password encrypted</span>
                      ) : (
                        <span className="text-amber-500">No password set</span>
                      )}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[550px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading">{selectedDestination ? "Edit Destination" : "Add Destination"}</DialogTitle>
            <DialogDescription>Configure an FTP/SFTP server for deploying static files.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="form-group">
              <Label htmlFor="name" className="form-label">Name *</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleInputChange} placeholder="Production Server" data-testid="destination-name-input" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <Label htmlFor="protocol" className="form-label">Protocol</Label>
                <Select value={formData.protocol} onValueChange={(v) => handleSelectChange("protocol", v)}>
                  <SelectTrigger data-testid="protocol-select">
                    <SelectValue placeholder="Select protocol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ftp">FTP</SelectItem>
                    <SelectItem value="sftp">SFTP (Secure)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="form-group">
                <Label htmlFor="port" className="form-label">Port</Label>
                <Input id="port" name="port" type="number" value={formData.port} onChange={handleInputChange} data-testid="destination-port-input" />
              </div>
            </div>
            
            <div className="form-group">
              <Label htmlFor="host" className="form-label">Host *</Label>
              <Input id="host" name="host" value={formData.host} onChange={handleInputChange} placeholder="ftp.example.com" data-testid="destination-host-input" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <Label htmlFor="username" className="form-label">Username *</Label>
                <Input id="username" name="username" value={formData.username} onChange={handleInputChange} placeholder="ftp_user" data-testid="destination-username-input" />
              </div>
              <div className="form-group">
                <Label htmlFor="password" className="form-label flex items-center gap-2">
                  Password
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                </Label>
                <Input id="password" name="password" type="password" value={formData.password} onChange={handleInputChange} placeholder={selectedDestination ? "Leave blank to keep" : "Enter password"} data-testid="destination-password-input" />
                <p className="form-hint text-emerald-600">Encrypted with AES-256</p>
              </div>
            </div>
            
            <div className="form-group">
              <Label htmlFor="root_path" className="form-label">Root Directory</Label>
              <Input id="root_path" name="root_path" value={formData.root_path} onChange={handleInputChange} placeholder="/public_html" data-testid="destination-root-input" />
              <p className="form-hint">Where to upload static files</p>
            </div>
            
            <div className="form-group">
              <Label htmlFor="public_url" className="form-label">Public URL</Label>
              <Input id="public_url" name="public_url" value={formData.public_url} onChange={handleInputChange} placeholder="https://static.example.com" data-testid="destination-public-url-input" />
              <p className="form-hint">Used for comparing deployed content</p>
            </div>
            
            <div className="form-group">
              <Label htmlFor="description" className="form-label">Description</Label>
              <Textarea id="description" name="description" value={formData.description} onChange={handleInputChange} placeholder="Optional notes..." rows={2} data-testid="destination-description-input" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="cancel-destination-btn">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="btn-primary-glow" data-testid="save-destination-btn">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              {selectedDestination ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Destination</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete "{selectedDestination?.name}"? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="confirm-delete-btn">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
