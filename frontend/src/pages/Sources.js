import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Globe,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  ExternalLink
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
  url: "",
  root_path: "/",
  description: ""
};

export default function Sources() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const [formData, setFormData] = useState(initialFormState);
  const [saving, setSaving] = useState(false);

  const fetchSources = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/sources`);
      setSources(response.data);
    } catch (error) {
      toast.error("Failed to fetch sources");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openCreateDialog = () => {
    setSelectedSource(null);
    setFormData(initialFormState);
    setIsDialogOpen(true);
  };

  const openEditDialog = (source) => {
    setSelectedSource(source);
    setFormData({
      name: source.name,
      url: source.url,
      root_path: source.root_path || "/",
      description: source.description || ""
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.url) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setSaving(true);
      if (selectedSource) {
        await axios.put(`${API}/sources/${selectedSource.id}`, formData);
        toast.success("Source updated successfully");
      } else {
        await axios.post(`${API}/sources`, formData);
        toast.success("Source created successfully");
      }
      setIsDialogOpen(false);
      fetchSources();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save source");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSource) return;
    
    try {
      await axios.delete(`${API}/sources/${selectedSource.id}`);
      toast.success("Source deleted successfully");
      setIsDeleteDialogOpen(false);
      setSelectedSource(null);
      fetchSources();
    } catch (error) {
      toast.error("Failed to delete source");
    }
  };

  return (
    <div className="page-container">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="sources-title">Sources</h1>
          <p className="page-description">WordPress sites to crawl and convert to static HTML. No login required - we only scrape public pages.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchSources} data-testid="refresh-sources-btn">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button className="btn-primary-glow" onClick={openCreateDialog} data-testid="add-source-btn">
            <Plus className="w-4 h-4 mr-2" />
            Add Source
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-primary/5 border-primary/20 mb-6">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Globe className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-sm">What is a Source?</p>
              <p className="text-sm text-muted-foreground mt-1">
                A source is any WordPress website you want to convert to static HTML. The crawler will visit all public pages and download HTML, CSS, JavaScript, and images. No credentials are needed - we only access publicly available content.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : sources.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent>
            <div className="empty-state">
              <Globe className="w-16 h-16 text-muted-foreground mb-4" />
              <p className="empty-state-title">No sources configured</p>
              <p className="empty-state-description">
                Add your first WordPress site to start converting it to static HTML.
              </p>
              <Button className="btn-primary-glow" onClick={openCreateDialog} data-testid="create-first-source-btn">
                <Plus className="w-4 h-4 mr-2" />
                Add First Source
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sources.map((source) => (
            <Card key={source.id} className="bg-card border-border card-hover" data-testid={`source-card-${source.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Globe className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold">{source.name}</CardTitle>
                      <span className="text-xs text-muted-foreground">WordPress Source</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(source)} data-testid={`edit-source-${source.id}-btn`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setSelectedSource(source); setIsDeleteDialogOpen(true); }} data-testid={`delete-source-${source.id}-btn`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ExternalLink className="w-3.5 h-3.5 text-primary" />
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="truncate font-mono text-xs hover:text-primary">{source.url}</a>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-xs">Root Path:</span>
                    <code className="font-mono text-xs bg-secondary px-1 rounded">{source.root_path}</code>
                  </div>
                </div>
                {source.description && (
                  <p className="text-xs text-muted-foreground border-t border-border pt-2">{source.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading">{selectedSource ? "Edit Source" : "Add Source"}</DialogTitle>
            <DialogDescription>Configure a WordPress site to crawl. No login credentials needed.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="form-group">
              <Label htmlFor="name" className="form-label">Name *</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleInputChange} placeholder="My WordPress Site" data-testid="source-name-input" />
            </div>
            
            <div className="form-group">
              <Label htmlFor="url" className="form-label">Website URL *</Label>
              <Input id="url" name="url" value={formData.url} onChange={handleInputChange} placeholder="https://example.wordpress.com" data-testid="source-url-input" />
              <p className="form-hint">The public URL of the WordPress site</p>
            </div>
            
            <div className="form-group">
              <Label htmlFor="root_path" className="form-label">Root Path</Label>
              <Input id="root_path" name="root_path" value={formData.root_path} onChange={handleInputChange} placeholder="/" data-testid="source-root-input" />
              <p className="form-hint">Starting path for crawling (usually "/")</p>
            </div>
            
            <div className="form-group">
              <Label htmlFor="description" className="form-label">Description</Label>
              <Textarea id="description" name="description" value={formData.description} onChange={handleInputChange} placeholder="Optional notes about this source..." data-testid="source-description-input" rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="cancel-source-btn">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="btn-primary-glow" data-testid="save-source-btn">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              {selectedSource ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Source</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete "{selectedSource?.name}"? This cannot be undone.</AlertDialogDescription>
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
