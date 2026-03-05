import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Link2,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Globe,
  Server,
  ArrowRight
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
import { Link } from "react-router-dom";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const initialFormState = {
  name: "",
  source_id: "",
  destination_id: "",
  description: "",
  auto_crawl: true
};

export default function Deployments() {
  const [deployments, setDeployments] = useState([]);
  const [sources, setSources] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedDeployment, setSelectedDeployment] = useState(null);
  const [formData, setFormData] = useState(initialFormState);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [deploymentsRes, sourcesRes, destinationsRes] = await Promise.all([
        axios.get(`${API}/deployment-configs`),
        axios.get(`${API}/sources`),
        axios.get(`${API}/destinations`)
      ]);
      setDeployments(deploymentsRes.data);
      setSources(sourcesRes.data);
      setDestinations(destinationsRes.data);
    } catch (error) {
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openCreateDialog = () => {
    setSelectedDeployment(null);
    setFormData(initialFormState);
    setIsDialogOpen(true);
  };

  const openEditDialog = (deployment) => {
    setSelectedDeployment(deployment);
    setFormData({
      name: deployment.name,
      source_id: deployment.source_id,
      destination_id: deployment.destination_id,
      description: deployment.description || "",
      auto_crawl: deployment.auto_crawl ?? true
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.source_id || !formData.destination_id) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setSaving(true);
      if (selectedDeployment) {
        await axios.put(`${API}/deployment-configs/${selectedDeployment.id}`, formData);
        toast.success("Deployment updated successfully");
      } else {
        await axios.post(`${API}/deployment-configs`, formData);
        toast.success("Deployment created successfully");
      }
      setIsDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save deployment");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDeployment) return;
    
    try {
      await axios.delete(`${API}/deployment-configs/${selectedDeployment.id}`);
      toast.success("Deployment deleted successfully");
      setIsDeleteDialogOpen(false);
      setSelectedDeployment(null);
      fetchData();
    } catch (error) {
      toast.error("Failed to delete deployment");
    }
  };

  const canCreateDeployment = sources.length > 0 && destinations.length > 0;

  return (
    <div className="page-container">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="deployments-title">Deployments</h1>
          <p className="page-description">Link a source to a destination to create a deployment configuration.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} data-testid="refresh-deployments-btn">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button className="btn-primary-glow" onClick={openCreateDialog} disabled={!canCreateDeployment} data-testid="add-deployment-btn">
            <Plus className="w-4 h-4 mr-2" />
            Create Deployment
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-amber-500/5 border-amber-500/20 mb-6">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Link2 className="w-5 h-5 text-amber-500 mt-0.5" />
            <div>
              <p className="font-medium text-sm">What is a Deployment?</p>
              <p className="text-sm text-muted-foreground mt-1">
                A deployment links one <span className="text-primary font-medium">Source</span> (WordPress site) to one <span className="text-emerald-500 font-medium">Destination</span> (FTP/SFTP server). When you run a deployment, it crawls the source and uploads static files to the destination.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prerequisites Check */}
      {!canCreateDeployment && (
        <Card className="bg-red-500/5 border-red-500/20 mb-6">
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-red-400 mb-2">Before creating a deployment, you need:</p>
            <div className="flex gap-4">
              {sources.length === 0 && (
                <Link to="/sources">
                  <Button variant="outline" size="sm" className="border-primary/50">
                    <Globe className="w-4 h-4 mr-2 text-primary" />
                    Add a Source
                  </Button>
                </Link>
              )}
              {destinations.length === 0 && (
                <Link to="/destinations">
                  <Button variant="outline" size="sm" className="border-emerald-500/50">
                    <Server className="w-4 h-4 mr-2 text-emerald-500" />
                    Add a Destination
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : deployments.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent>
            <div className="empty-state">
              <Link2 className="w-16 h-16 text-muted-foreground mb-4" />
              <p className="empty-state-title">No deployments configured</p>
              <p className="empty-state-description">
                Create a deployment to link a WordPress source to an FTP/SFTP destination.
              </p>
              {canCreateDeployment && (
                <Button className="btn-primary-glow" onClick={openCreateDialog} data-testid="create-first-deployment-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Deployment
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {deployments.map((deployment) => (
            <Card key={deployment.id} className="bg-card border-border card-hover" data-testid={`deployment-card-${deployment.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <Link2 className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold">{deployment.name}</CardTitle>
                      <span className="text-xs text-muted-foreground">Deployment Config</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(deployment)} data-testid={`edit-deployment-${deployment.id}-btn`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setSelectedDeployment(deployment); setIsDeleteDialogOpen(true); }} data-testid={`delete-deployment-${deployment.id}-btn`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Globe className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{deployment.source_name}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Server className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{deployment.destination_name}</span>
                  </div>
                </div>
                {deployment.description && (
                  <p className="text-xs text-muted-foreground mt-3">{deployment.description}</p>
                )}
                <div className="mt-3 pt-3 border-t border-border">
                  <Link to={`/deploy?config=${deployment.id}`}>
                    <Button size="sm" className="w-full">
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Run This Deployment
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading">{selectedDeployment ? "Edit Deployment" : "Create Deployment"}</DialogTitle>
            <DialogDescription>Link a WordPress source to an FTP/SFTP destination.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="form-group">
              <Label htmlFor="name" className="form-label">Deployment Name *</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleInputChange} placeholder="Production Deploy" data-testid="deployment-name-input" />
            </div>
            
            <div className="form-group">
              <Label className="form-label flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                Source (WordPress Site) *
              </Label>
              <Select value={formData.source_id} onValueChange={(v) => setFormData(prev => ({ ...prev, source_id: v }))}>
                <SelectTrigger data-testid="source-select">
                  <SelectValue placeholder="Select a source" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name} - {source.url}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="form-hint">The WordPress site to crawl</p>
            </div>
            
            <div className="form-group">
              <Label className="form-label flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-500" />
                Destination (FTP/SFTP Server) *
              </Label>
              <Select value={formData.destination_id} onValueChange={(v) => setFormData(prev => ({ ...prev, destination_id: v }))}>
                <SelectTrigger data-testid="destination-select">
                  <SelectValue placeholder="Select a destination" />
                </SelectTrigger>
                <SelectContent>
                  {destinations.map((dest) => (
                    <SelectItem key={dest.id} value={dest.id}>
                      {dest.name} - {dest.host} ({dest.protocol.toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="form-hint">Where to upload static files</p>
            </div>
            
            <div className="form-group">
              <Label htmlFor="description" className="form-label">Description</Label>
              <Textarea id="description" name="description" value={formData.description} onChange={handleInputChange} placeholder="Optional notes about this deployment..." rows={2} data-testid="deployment-description-input" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="cancel-deployment-btn">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="btn-primary-glow" data-testid="save-deployment-btn">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              {selectedDeployment ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deployment</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete "{selectedDeployment?.name}"? This cannot be undone.</AlertDialogDescription>
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
