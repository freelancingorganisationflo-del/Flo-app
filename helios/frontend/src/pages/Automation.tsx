import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type Automation as AutomationRecord, type AutomationInput, type AutomationRun } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import { Icon } from "@/components/Icon";

type PresetKey = "deadline" | "morning" | "news";

interface Preset {
  label: string;
  action_type: string;
  action_config: Record<string, unknown>;
  conditions: Record<string, unknown>;
  trigger_config: Record<string, unknown>;
}

const PRESETS: Record<PresetKey, Preset> = {
  deadline: {
    label: "Deadline Guardian",
    action_type: "deadline_briefing",
    action_config: { within_hours: 24 },
    conditions: { type: "always_true" },
    trigger_config: { frequency: "interval", minutes: 60 },
  },
  morning: {
    label: "Morning Briefing",
    action_type: "morning_briefing",
    action_config: {},
    conditions: { type: "always_true" },
    trigger_config: { frequency: "daily", time: "08:00" },
  },
  news: {
    label: "News Monitor",
    action_type: "news_monitor",
    action_config: { topic: "AI", max_items: 5 },
    conditions: { type: "always_true" },
    trigger_config: { frequency: "daily", time: "09:00" },
  },
};

const ACTION_LABELS: Record<string, string> = {
  deadline_briefing: "Deadline briefing",
  morning_briefing: "Morning briefing",
  news_monitor: "News monitor",
};

const STATUS_COLORS: Record<string, string> = {
  success: "bg-mint/10 text-mint border-mint/30",
  failed: "bg-red/10 text-red border-red/30",
  skipped_condition: "bg-amber/10 text-amber border-amber/30",
};

function scheduleLabel(cfg: Record<string, unknown>): string {
  if (cfg.frequency === "hourly") return "Hourly";
  if (cfg.frequency === "daily") return `Daily at ${String(cfg.time ?? "08:00")}`;
  return `Every ${String(cfg.minutes ?? 60)} min`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Automation() {
  const [automations, setAutomations] = useState<AutomationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [preset, setPreset] = useState<PresetKey>("deadline");
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("interval");
  const [minutes, setMinutes] = useState("60");
  const [time, setTime] = useState("08:00");
  const [topic, setTopic] = useState("AI");
  const [withinHours, setWithinHours] = useState("24");
  const [submitting, setSubmitting] = useState(false);

  const [historyFor, setHistoryFor] = useState<number | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runStats, setRunStats] = useState({ total: 0, success: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAutomations(await api.listAutomations());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load automations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (automations.length === 0) {
      setRunStats({ total: 0, success: 0 });
      return;
    }
    let cancelled = false;
    void Promise.allSettled(automations.map((a) => api.listAutomationRuns(a.id))).then((results) => {
      if (cancelled) return;
      let total = 0;
      let success = 0;
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        total += result.value.length;
        success += result.value.filter((run) => run.status === "success").length;
      }
      setRunStats({ total, success });
    });
    return () => {
      cancelled = true;
    };
  }, [automations]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2500);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const base = PRESETS[preset];
    const trigger: Record<string, unknown> =
      frequency === "daily"
        ? { frequency: "daily", time }
        : frequency === "hourly"
          ? { frequency: "hourly" }
          : { frequency: "interval", minutes: Number(minutes) || 60 };
    const actionConfig: Record<string, unknown> = { ...base.action_config };
    if (base.action_type === "news_monitor") actionConfig.topic = topic || "AI";
    if (base.action_type === "deadline_briefing")
      actionConfig.within_hours = Number(withinHours) || 24;

    const payload: AutomationInput = {
      name: name.trim() || base.label,
      action_type: base.action_type,
      trigger_config: trigger,
      action_config: actionConfig,
      conditions: base.conditions,
    };
    setSubmitting(true);
    try {
      await api.createAutomation(payload);
      setName("");
      await load();
      flash("Automation created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create automation");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(a: AutomationRecord) {
    setBusyId(a.id);
    try {
      await api.updateAutomation(a.id, { enabled: !a.enabled });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update automation");
    } finally {
      setBusyId(null);
    }
  }

  async function runNow(a: AutomationRecord) {
    setBusyId(a.id);
    try {
      const run = await api.runAutomation(a.id);
      flash(
        run.status === "success"
          ? "Ran successfully"
          : run.status === "skipped_condition"
            ? "Skipped: condition not met"
            : "Run failed"
      );
      await load();
      if (historyFor === a.id) await openHistory(a.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run automation");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(a: AutomationRecord) {
    setBusyId(a.id);
    try {
      await api.deleteAutomation(a.id);
      if (historyFor === a.id) setHistoryFor(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete automation");
    } finally {
      setBusyId(null);
    }
  }

  async function openHistory(id: number) {
    if (historyFor === id) {
      setHistoryFor(null);
      return;
    }
    setHistoryFor(id);
    setRunsLoading(true);
    try {
      setRuns(await api.listAutomationRuns(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load run history");
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }

  const activeCount = automations.filter((a) => a.enabled).length;
  const successRate = runStats.total ? `${Math.round((runStats.success / runStats.total) * 100)}%` : "0%";

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-slim">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="font-display font-bold text-2xl text-ink">Automation</h1>
            <p className="text-sm text-grey mt-1">Let HELIOS handle your repetitive work.</p>
          </div>
          <button
            type="button"
            onClick={() => document.getElementById("automation-name")?.focus()}
            className="btn-primary flex items-center gap-2"
          >
            <Icon name="plus" className="w-4 h-4" />
            Create Automation
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          <div className="glass rounded-2xl px-5 py-4">
            <p className="font-display font-bold text-3xl text-ink">{activeCount}</p>
            <p className="text-xs text-grey mt-1">Active Automations</p>
          </div>
          <div className="glass rounded-2xl px-5 py-4">
            <p className="font-display font-bold text-3xl text-ink">{runStats.total}</p>
            <p className="text-xs text-grey mt-1">Total Executed</p>
          </div>
          <div className="glass rounded-2xl px-5 py-4">
            <p className="font-display font-bold text-3xl text-ink">{successRate}</p>
            <p className="text-xs text-grey mt-1">Success Rate</p>
          </div>
        </div>

        <form
          onSubmit={handleCreate}
          className="glass rounded-2xl p-4 mb-6 space-y-3 animate-fade-up"
          style={{ animationDelay: "60ms" }}
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as PresetKey)}
              className="input-dark bg-navy3 sm:w-52"
            >
              {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
                <option key={key} value={key}>
                  {PRESETS[key].label}
                </option>
              ))}
            </select>
            <input
              id="automation-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Name (default: ${PRESETS[preset].label})`}
              className="input-dark flex-1"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="input-dark bg-navy3 w-auto"
            >
              <option value="interval">Every N minutes</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily at time</option>
            </select>
            {frequency === "interval" && (
              <input
                type="number"
                min={1}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="input-dark w-24"
                aria-label="Interval minutes"
              />
            )}
            {frequency === "daily" && (
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="input-dark [color-scheme:dark] w-auto"
              />
            )}
            {PRESETS[preset].action_type === "deadline_briefing" && (
              <label className="flex items-center gap-2 text-sm text-grey">
                Within
                <input
                  type="number"
                  min={1}
                  value={withinHours}
                  onChange={(e) => setWithinHours(e.target.value)}
                  className="input-dark w-20"
                  aria-label="Within hours"
                />
                hours
              </label>
            )}
            {PRESETS[preset].action_type === "news_monitor" && (
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Topic"
                className="input-dark w-40"
              />
            )}
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary flex items-center gap-2 ml-auto"
            >
              {submitting && <Spinner className="w-4 h-4" />}
              Create
            </button>
          </div>
        </form>

        {notice && (
          <p className="text-sm text-mint glass border-mint/30 rounded-lg px-3 py-2 mb-4 animate-fade-in">
            {notice}
          </p>
        )}
        {error && (
          <p className="text-sm text-red glass border-red/30 rounded-lg px-3 py-2 mb-4 animate-fade-in">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : automations.length === 0 ? (
          <div className="text-center text-grey text-sm py-12 animate-fade-in">
            <Icon name="zap" className="w-8 h-8 mx-auto mb-3 text-faint" />
            No automations yet. Create one above.
          </div>
        ) : (
          <ul className="space-y-2 animate-fade-in">
            {automations.map((a) => (
              <li key={a.id} className="glass rounded-2xl px-4 py-3 hover:border-cyan/25 transition-all">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      a.enabled ? "bg-cyan/15 text-cyan" : "bg-white/[0.04] text-faint"
                    }`}
                  >
                    <Icon name="zap" className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink truncate">{a.name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="chip bg-violet/10 text-violet border-violet/30">
                        {ACTION_LABELS[a.action_type] ?? a.action_type}
                      </span>
                      <span className="text-[11px] text-grey flex items-center gap-1">
                        <Icon name="clock" className="w-3 h-3" />
                        {scheduleLabel(a.trigger_config)}
                      </span>
                      <span className="text-[11px] text-faint">Next {formatDate(a.next_run_at)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggle(a)}
                    disabled={busyId === a.id}
                    aria-label={a.enabled ? "Disable" : "Enable"}
                    role="switch"
                    aria-checked={a.enabled}
                    className={`relative w-10 h-6 rounded-full p-0.5 transition-colors disabled:opacity-40 ${
                      a.enabled ? "bg-blue" : "bg-line"
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                        a.enabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center gap-3 mt-2 pl-12">
                  <button
                    onClick={() => runNow(a)}
                    disabled={busyId === a.id}
                    className="text-[11px] text-grey hover:text-cyan flex items-center gap-1 transition-colors"
                  >
                    <Icon name="refresh" className="w-3 h-3" />
                    Run now
                  </button>
                  <button
                    onClick={() => openHistory(a.id)}
                    className="text-[11px] text-grey hover:text-cyan flex items-center gap-1 transition-colors"
                  >
                    <Icon name="clock" className="w-3 h-3" />
                    History
                  </button>
                  <span className="text-[11px] text-faint">Last {formatDate(a.last_run_at)}</span>
                  <button
                    onClick={() => remove(a)}
                    disabled={busyId === a.id}
                    aria-label="Delete automation"
                    className="ml-auto text-faint hover:text-red px-2 py-1 rounded-lg hover:bg-red/10 transition-colors"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                </div>

                {historyFor === a.id && (
                  <div className="mt-3 border-t border-line pt-2 pl-12 space-y-1.5">
                    {runsLoading ? (
                      <Spinner className="w-4 h-4" />
                    ) : runs.length === 0 ? (
                      <p className="text-[12px] text-faint">No runs yet.</p>
                    ) : (
                      runs.map((run) => (
                        <div key={run.id} className="text-[12px]">
                          <div className="flex items-center gap-2">
                            <span
                              className={`chip ${STATUS_COLORS[run.status] ?? "bg-white/[0.04] text-faint border-line"}`}
                            >
                              {run.status}
                            </span>
                            <span className="text-faint">{formatDate(run.run_at)}</span>
                          </div>
                          {run.result_summary && (
                            <p className="text-grey mt-1 whitespace-pre-wrap break-words">
                              {run.result_summary}
                            </p>
                          )}
                          {run.error && <p className="text-red mt-1">{run.error}</p>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
