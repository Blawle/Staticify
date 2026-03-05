import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Clock,
  Plus,
  Trash2,
  RefreshCw,
  Play,
  Pause,
  Calendar,
  Globe
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const cronPresets = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Daily at 6 AM", value: "0 6 * * *" },
  { label: "Weekly (Sunday midnight)", value: "0 0 * * 0" },
  { label: "Monthly (1st at midnight)", value: "0 0 1 * *" },
];

export default function Schedules() {
  const [schedules, setSchedules] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [cronExpression, setCronExpression] = useState("0 0 * * *");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [schedulesRes, profilesRes] = await Promise.all([
        axios.get(`${API}/schedules`),
        axios.get(`${API}/profiles`)
      ]);
      setSchedules(schedulesRes.data);
      setProfiles(profilesRes.data);
    } catch (error) {
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedProfileId || !cronExpression) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      setSaving(true);
      await axios.post(`${API}/schedules`, {
        profile_id: selectedProfileId,
        cron_expression: cronExpression,
        enabled: true
      });
      toast.success("Schedule created successfully");
      setIsDialogOpen(false);
      setSelectedProfileId("");
      setCronExpression("0 0 * * *");
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

  const openDeleteDialog = (schedule) => {
    setSelectedSchedule(schedule);
    setIsDeleteDialogOpen(true);
  };

  return (
    <div className="page-container">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="schedules-title">Scheduled Deployments</h1>
          <p className="page-description">Automate your WordPress to static deployments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} data-testid="refresh-schedules-btn">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button className="btn-primary-glow" onClick={() => setIsDialogOpen(true)} data-testid="add-schedule-btn">
            <Plus className="w-4 h-4 mr-2" />
            Add Schedule
          </Button>
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : schedules.length === 0 ? (
            <div className="empty-state">
              <img
                src="https://images.unsplash.com/photo-1702478475268-aa8ef54c084e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHwxfHxzZXJ2ZXIlMjByYWNrc3xlbnwwfHx8fDE3NzI3MzMxNTd8MA&ixlib=rb-4.1.0&q=85&w=400"
                alt="Empty state"
                className="empty-state-image"
              />
              <p className="empty-state-title">No scheduled deployments</p>
              <p className="empty-state-description">
                Set up automated deployments to keep your static site in sync with WordPress.
              </p>
              <Button className="btn-primary-glow" onClick={() => setIsDialogOpen(true)} data-testid="create-first-schedule-btn">
                <Clock className="w-4 h-4 mr-2" />
                Create First Schedule
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site Profile</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => (
                  <TableRow key={schedule.id} data-testid={`schedule-row-${schedule.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-primary" />
                        <span className="font-medium">{schedule.profile_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="font-mono text-xs bg-secondary px-2 py-1 rounded">
                        {schedule.cron_expression}
                      </code>
                    </TableCell>
                    <TableCell>
                      {schedule.last_run ? (
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(schedule.last_run), "MMM d, h:mm a")}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={schedule.enabled}
                          onCheckedChange={() => handleToggle(schedule)}
                          data-testid={`toggle-schedule-${schedule.id}`}
                        />
                        <span className={`text-xs ${schedule.enabled ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                          {schedule.enabled ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => openDeleteDialog(schedule)}
                        data-testid={`delete-schedule-${schedule.id}-btn`}
                      >
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

      {/* Cron Reference Card */}
      <Card className="bg-card border-border mt-6">
        <CardHeader>
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Cron Expression Reference
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cronPresets.map((preset, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                <span className="text-sm">{preset.label}</span>
                <code className="font-mono text-xs bg-background px-2 py-1 rounded">{preset.value}</code>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Format: minute hour day month weekday (e.g., "0 0 * * *" = daily at midnight)
          </p>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading">Create Scheduled Deployment</DialogTitle>
            <DialogDescription>
              Set up automated deployments for your WordPress site.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="form-group">
              <Label htmlFor="profile" className="form-label">Site Profile</Label>
              <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                <SelectTrigger data-testid="schedule-profile-select">
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

            <div className="form-group">
              <Label htmlFor="preset" className="form-label">Schedule Preset</Label>
              <Select value={cronExpression} onValueChange={setCronExpression}>
                <SelectTrigger data-testid="schedule-preset-select">
                  <SelectValue placeholder="Select a schedule" />
                </SelectTrigger>
                <SelectContent>
                  {cronPresets.map((preset, index) => (
                    <SelectItem key={index} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="form-group">
              <Label htmlFor="cron" className="form-label">Custom Cron Expression</Label>
              <Input
                id="cron"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 0 * * *"
                className="font-mono"
                data-testid="cron-input"
              />
              <p className="form-hint">Or enter a custom cron expression</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="cancel-schedule-btn">
              Cancel
            </Button>
            <Button 
              onClick={handleCreate} 
              disabled={saving || !selectedProfileId}
              className="btn-primary-glow"
              data-testid="save-schedule-btn"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this scheduled deployment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete-schedule-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-delete-schedule-btn"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
