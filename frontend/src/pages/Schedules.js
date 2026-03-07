import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Clock,
  Plus,
  Trash2,
  RefreshCw,
  Timer,
  Link2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "react-router-dom";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const intervalPresets = [
  { label: "Every hour", value: "1" },
  { label: "Every 2 hours", value: "2" },
  { label: "Every 6 hours", value: "6" },
  { label: "Every 12 hours", value: "12" },
  { label: "Every 24 hours (daily)", value: "24" },
  { label: "Every 48 hours", value: "48" },
  { label: "Every 72 hours (3 days)", value: "72" },
  { label: "Every 168 hours (weekly)", value: "168" },
];

export default function Schedules() {
  const [schedules, setSchedules] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [intervalHours, setIntervalHours] = useState("24");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [schedulesRes, deploymentsRes] = await Promise.all([
        axios.get(`${API}/schedules`),
        axios.get(`${API}/deployment-configs`)
      ]);
      setSchedules(schedulesRes.data);
      setDeployments(deploymentsRes.data);
    } catch (error) {
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedConfigId || !intervalHours) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      setSaving(true);
      await axios.post(`${API}/schedules`, {
        deployment_config_id: selectedConfigId,
        interval_hours: parseInt(intervalHours, 10),
        enabled: true
      });
      toast.success("Schedule created");
      setIsDialogOpen(false);
      setSelectedConfigId("");
      setIntervalHours("24");
      fetchData();
    } catch (error) {
      toast.error("Failed to create schedule");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (schedule) => {
    try {
      await axios.put(`${API}/schedules/${schedule.id}?enabled=${!schedule.enabled}`);
      toast.success(schedule.enabled ? "Schedule disabled" : "Schedule enabled");
      fetchData();
    } catch (error) {
      toast.error("Failed to update schedule");
    }
  };

  const handleDelete = async () => {
    if (!selectedSchedule) return;
    try {
      await axios.delete(`${API}/schedules/${selectedSchedule.id}`);
      toast.success("Schedule deleted");
      setIsDeleteDialogOpen(false);
      setSelectedSchedule(null);
      fetchData();
    } catch (error) {
      toast.error("Failed to delete schedule");
    }
  };

  const formatInterval = (hours) => {
    if (!hours) return "Unknown";
    if (hours < 24) return `Every ${hours} hour${hours > 1 ? 's' : ''}`;
    const days = hours / 24;
    if (days === 1) return "Daily";
    if (days === 7) return "Weekly";
    return `Every ${days} days`;
  };

  const canCreateSchedule = deployments.length > 0;

  return (
    <div className="page-container">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="schedules-title">Scheduled Deployments</h1>
          <p className="page-description">Automate your deployments with interval-based schedules</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} data-testid="refresh-schedules-btn">
            <RefreshCw className="w-4 h-4 mr-2" />Refresh
          </Button>
          <Button className="btn-primary-glow" onClick={() => setIsDialogOpen(true)} disabled={!canCreateSchedule} data-testid="add-schedule-btn">
            <Plus className="w-4 h-4 mr-2" />Add Schedule
          </Button>
        </div>
      </div>

      {!canCreateSchedule && (
        <Card className="bg-amber-500/5 border-amber-500/20 mb-6">
          <CardContent className="pt-4">
            <p className="text-sm text-amber-400">You need at least one deployment configuration to create a schedule.</p>
            <Link to="/deployments" className="mt-2 inline-block">
              <Button variant="outline" size="sm"><Link2 className="w-4 h-4 mr-2" />Create Deployment</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : schedules.length === 0 ? (
            <div className="empty-state">
              <Clock className="w-16 h-16 text-muted-foreground mb-4" />
              <p className="empty-state-title">No scheduled deployments</p>
              <p className="empty-state-description">Set up automated deployments with interval-based schedules.</p>
              {canCreateSchedule && (
                <Button className="btn-primary-glow" onClick={() => setIsDialogOpen(true)} data-testid="create-first-schedule-btn">
                  <Clock className="w-4 h-4 mr-2" />Create First Schedule
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deployment</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => (
                  <TableRow key={schedule.id} data-testid={`schedule-row-${schedule.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-amber-500" />
                        <span className="font-medium">{schedule.deployment_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Timer className="w-3.5 h-3.5 text-primary" />
                        <span className="text-sm">{formatInterval(schedule.interval_hours)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {schedule.last_run ? new Date(schedule.last_run).toLocaleString() : "Never"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {schedule.next_run ? new Date(schedule.next_run).toLocaleString() : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={schedule.enabled} onCheckedChange={() => handleToggle(schedule)} data-testid={`toggle-schedule-${schedule.id}`} />
                        <span className={`text-xs ${schedule.enabled ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                          {schedule.enabled ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setSelectedSchedule(schedule); setIsDeleteDialogOpen(true); }} data-testid={`delete-schedule-${schedule.id}-btn`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Interval Reference */}
      <Card className="bg-card border-border mt-6">
        <CardHeader>
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <Timer className="w-4 h-4 text-primary" />Interval Reference
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {intervalPresets.map((preset, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                <span className="text-sm">{preset.label}</span>
                <code className="font-mono text-xs bg-background px-2 py-1 rounded">{preset.value}h</code>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading">Create Schedule</DialogTitle>
            <DialogDescription>Schedule automated deployments at regular intervals.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="form-group">
              <Label className="form-label">Deployment</Label>
              <Select value={selectedConfigId} onValueChange={setSelectedConfigId}>
                <SelectTrigger data-testid="schedule-deployment-select">
                  <SelectValue placeholder="Select a deployment" />
                </SelectTrigger>
                <SelectContent>
                  {deployments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="form-group">
              <Label className="form-label">Run Interval</Label>
              <Select value={intervalHours} onValueChange={setIntervalHours}>
                <SelectTrigger data-testid="schedule-interval-select">
                  <SelectValue placeholder="Select an interval" />
                </SelectTrigger>
                <SelectContent>
                  {intervalPresets.map((preset, index) => (
                    <SelectItem key={index} value={preset.value}>{preset.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="cancel-schedule-btn">Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !selectedConfigId} className="btn-primary-glow" data-testid="save-schedule-btn">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>Are you sure? This will stop the scheduled deployments.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete-schedule-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="confirm-delete-schedule-btn">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
