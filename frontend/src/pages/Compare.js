import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  FileDiff,
  Globe,
  Server,
  RefreshCw,
  Search,
  FileText,
  Eye,
  Plus,
  Minus,
  ArrowLeftRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Compare() {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [pagePath, setPagePath] = useState("/");
  
  // Content comparison
  const [contentResult, setContentResult] = useState(null);
  
  // File comparison
  const [fileResult, setFileResult] = useState(null);
  
  const [activeTab, setActiveTab] = useState("visual");

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    if (selectedProfileId) {
      const profile = profiles.find(p => p.id === selectedProfileId);
      setSelectedProfile(profile);
    }
  }, [selectedProfileId, profiles]);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/profiles`);
      setProfiles(response.data);
      if (response.data.length > 0) {
        setSelectedProfileId(response.data[0].id);
      }
    } catch (error) {
      toast.error("Failed to fetch profiles");
    } finally {
      setLoading(false);
    }
  };

  const compareContent = async () => {
    if (!selectedProfileId) {
      toast.error("Please select a site profile");
      return;
    }

    try {
      setComparing(true);
      const response = await axios.post(`${API}/compare/content`, {
        profile_id: selectedProfileId,
        page_path: pagePath
      });
      setContentResult(response.data);
      
      if (response.data.has_differences) {
        toast.info(`Found ${response.data.differences.length} differences`);
      } else {
        toast.success("No differences found");
      }
    } catch (error) {
      toast.error("Comparison failed");
    } finally {
      setComparing(false);
    }
  };

  const compareFiles = async () => {
    if (!selectedProfileId) {
      toast.error("Please select a site profile");
      return;
    }

    try {
      setComparing(true);
      const response = await axios.post(`${API}/compare/files`, {
        profile_id: selectedProfileId,
        page_path: pagePath
      });
      setFileResult(response.data);
      toast.success("File comparison complete");
    } catch (error) {
      toast.error("File comparison failed");
    } finally {
      setComparing(false);
    }
  };

  const handleCompare = () => {
    if (activeTab === "visual") {
      compareContent();
    } else {
      compareFiles();
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title" data-testid="compare-title">Compare Sites</h1>
        <p className="page-description">Compare your WordPress source with the deployed static site</p>
      </div>

      {/* Controls */}
      <Card className="bg-card border-border mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="form-label mb-2 block">Site Profile</label>
              <Select
                value={selectedProfileId}
                onValueChange={setSelectedProfileId}
              >
                <SelectTrigger data-testid="compare-site-select">
                  <SelectValue placeholder="Select a site profile" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex-1 min-w-[200px]">
              <label className="form-label mb-2 block">Page Path</label>
              <Input
                value={pagePath}
                onChange={(e) => setPagePath(e.target.value)}
                placeholder="/"
                data-testid="page-path-input"
              />
            </div>

            <Button 
              onClick={handleCompare}
              disabled={!selectedProfileId || comparing}
              className="btn-primary-glow"
              data-testid="compare-btn"
            >
              {comparing ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Compare
            </Button>
          </div>

          {selectedProfile && (
            <div className="mt-4 flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                <span>Internal: {selectedProfile.wordpress_url}</span>
              </div>
              <ArrowLeftRight className="w-4 h-4" />
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-500" />
                <span>External: {selectedProfile.external_url || "Not configured"}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comparison Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="visual" className="gap-2" data-testid="visual-tab">
            <Eye className="w-4 h-4" />
            Visual Diff
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-2" data-testid="files-tab">
            <FileText className="w-4 h-4" />
            File Diff
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visual">
          <Card className="bg-card border-border overflow-hidden">
            <ResizablePanelGroup direction="horizontal" className="min-h-[600px]">
              <ResizablePanel defaultSize={50} minSize={30}>
                <div className="h-full flex flex-col">
                  <div className="compare-pane-header flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    Internal (WordPress)
                  </div>
                  <ScrollArea className="flex-1 p-4">
                    {contentResult ? (
                      <pre className="font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                        {contentResult.internal_content || "No content retrieved"}
                      </pre>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        Run comparison to see content
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </ResizablePanel>
              
              <ResizableHandle withHandle />
              
              <ResizablePanel defaultSize={50} minSize={30}>
                <div className="h-full flex flex-col">
                  <div className="compare-pane-header flex items-center gap-2">
                    <Server className="w-4 h-4 text-emerald-500" />
                    External (Static)
                  </div>
                  <ScrollArea className="flex-1 p-4">
                    {contentResult ? (
                      <pre className="font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                        {contentResult.external_content || "No content retrieved"}
                      </pre>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        Run comparison to see content
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </Card>

          {/* Differences Summary */}
          {contentResult?.has_differences && (
            <Card className="bg-card border-border mt-4">
              <CardHeader>
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <FileDiff className="w-4 h-4 text-amber-500" />
                  Differences Found ({contentResult.differences.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[300px] overflow-auto">
                  {contentResult.differences.map((diff, index) => (
                    <div 
                      key={index}
                      className={`p-2 rounded font-mono text-xs ${
                        diff.type === "added" ? "diff-added" : "diff-removed"
                      }`}
                    >
                      <span className="mr-2">
                        {diff.type === "added" ? (
                          <Plus className="w-3 h-3 inline" />
                        ) : (
                          <Minus className="w-3 h-3 inline" />
                        )}
                      </span>
                      {diff.content}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="files">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Added Files */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="font-heading text-base flex items-center gap-2 text-emerald-500">
                  <Plus className="w-4 h-4" />
                  Added ({fileResult?.added?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {fileResult?.added?.length > 0 ? (
                    <div className="space-y-1">
                      {fileResult.added.map((file, index) => (
                        <div 
                          key={index}
                          className="p-2 bg-emerald-500/10 rounded text-xs font-mono truncate"
                        >
                          {file}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No new files</p>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Removed Files */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="font-heading text-base flex items-center gap-2 text-red-500">
                  <Minus className="w-4 h-4" />
                  Removed ({fileResult?.removed?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {fileResult?.removed?.length > 0 ? (
                    <div className="space-y-1">
                      {fileResult.removed.map((file, index) => (
                        <div 
                          key={index}
                          className="p-2 bg-red-500/10 rounded text-xs font-mono truncate"
                        >
                          {file}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No removed files</p>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Modified Files */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="font-heading text-base flex items-center gap-2 text-amber-500">
                  <FileDiff className="w-4 h-4" />
                  Modified ({fileResult?.modified?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {fileResult?.modified?.length > 0 ? (
                    <div className="space-y-1">
                      {fileResult.modified.map((file, index) => (
                        <div 
                          key={index}
                          className="p-2 bg-amber-500/10 rounded text-xs font-mono truncate"
                        >
                          {file}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No modified files</p>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Internal Files List */}
          {fileResult && (
            <Card className="bg-card border-border mt-6">
              <CardHeader>
                <CardTitle className="font-heading text-base">
                  Internal Files ({fileResult.internal_files?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px]">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {fileResult.internal_files?.map((file, index) => (
                      <div 
                        key={index}
                        className="p-2 bg-secondary/50 rounded text-xs font-mono truncate"
                        title={file}
                      >
                        {file}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
