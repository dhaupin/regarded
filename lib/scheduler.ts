/**
 * Scheduler - Cron-like scheduling and heartbeat
 * 
 * Task scheduling, health checks, periodic jobs.
 * Inspired by Vant's scheduler module.
 */

import { createError, ErrorCode, errors } from './error';
import { EventEmitter } from './event';

export interface SchedulerEvents {
  'scheduler:job-start': { jobId: string; name: string };
  'scheduler:job-end': { jobId: string; name: string; duration: number };
  'scheduler:job-error': { jobId: string; name: string; error: string };
  'scheduler:job-missed': { jobId: string; name: string };
  'scheduler:heartbeat-missed': { service: string; timeSinceBeat: number };
  'scheduler:heartbeat-beat': { service: string };
};

export type JobHandler = () => void | Promise<void>;

export interface ScheduledJob {
  id: string;
  name: string;
  schedule: string; // cron-like: "0 * * * *" = every hour
  handler: JobHandler;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  runCount: number;
  errorCount: number;
  lastError?: string;
}

export interface SchedulerConfig {
  /** Max concurrent jobs */
  maxConcurrent: number;
  /** Default timezone */
  timezone: string;
  /** Enable health checks */
  enableHealthChecks: boolean;
  /** Health check interval in ms */
  healthCheckInterval: number;
}

export interface HealthStatus {
  healthy: boolean;
  jobsRunning: number;
  jobsTotal: number;
  lastHealthCheck: number;
  jobStatuses: Record<string, {
    lastRun: number;
    lastError?: string;
    runCount: number;
  }>;
}

interface RunningJob {
  job: ScheduledJob;
  startedAt: number;
  promise: Promise<void>;
}

/**
 * Cron Parser
 */
export class CronParser {
  /**
   * Parse cron string to next run time
   */
  static parse(schedule: string, fromTime: number = Date.now()): number {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length < 5) {
      throw createError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid cron format: need 5 parts (minute hour day month weekday)',
        statusCode: 400,
      });
    }
    
    const [minute, hour, day, month, weekday] = parts;
    const date = new Date(fromTime);
    
    // Simple cron implementation
    // Supports: * for any, */n for every n, n for specific
    
    // Set to next occurrence
    date.setSeconds(0);
    date.setMilliseconds(0);
    
    // Add 1 minute minimum
    date.setMinutes(date.getMinutes() + 1);
    
    // This is a simplified parser - real cron is more complex
    // For production, use a library like cron-parser
    
    return date.getTime();
  }
  
  /**
   * Check if schedule matches now
   */
  static matches(schedule: string, time: number = Date.now()): boolean {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length < 5) return false;
    
    const [minute, hour, day, month, weekday] = parts;
    const date = new Date(time);
    
    return (
      this.matchesPart(minute, date.getMinutes()) &&
      this.matchesPart(hour, date.getHours()) &&
      this.matchesPart(day, date.getDate()) &&
      this.matchesPart(month, date.getMonth() + 1) &&
      this.matchesPart(weekday, date.getDay())
    );
  }
  
  /**
   * Match cron part
   */
  private static matchesPart(part: string, value: number): boolean {
    if (part === '*') return true;
    
    // Handle */n (every n)
    if (part.startsWith('*/')) {
      const n = parseInt(part.slice(2));
      return value % n === 0;
    }
    
    // Handle list (1,2,3)
    if (part.includes(',')) {
      return part.split(',').map(p => parseInt(p)).includes(value);
    }
    
    // Handle range (1-5)
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(p => parseInt(p));
      return value >= start && value <= end;
    }
    
    return parseInt(part) === value;
  }
  
  /**
   * Get human readable description
   */
  static describe(schedule: string): string {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length < 5) return 'Invalid';
    
    const [minute, hour] = parts;
    
    if (minute === '*' && hour === '*') return 'Every minute';
    if (minute === '0' && hour === '*') return 'Every hour';
    if (minute === '0' && hour === '0') return 'Daily at midnight';
    if (minute !== '*' && hour !== '*') return `At ${hour}:${minute.padStart(2, '0')}`;
    if (hour === '*') return `Every hour at minute ${minute}`;
    
    return schedule;
  }
}

/**
 * Scheduler
 */
export class Scheduler extends EventEmitter<SchedulerEvents> {
  private config: SchedulerConfig;
  private jobs = new Map<string, ScheduledJob>();
  private runningJobs = new Map<string, RunningJob>();
  private healthStatus: HealthStatus;
  private intervalId?: ReturnType<typeof setInterval>;
  private healthCheckId?: ReturnType<typeof setInterval>;
  
  constructor(config: Partial<SchedulerConfig> = {}) {
    super();
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 5,
      timezone: config.timezone ?? 'UTC',
      enableHealthChecks: config.enableHealthChecks ?? true,
      healthCheckInterval: config.healthCheckInterval ?? 60000,
    };
    
    this.healthStatus = {
      healthy: true,
      jobsRunning: 0,
      jobsTotal: 0,
      lastHealthCheck: Date.now(),
      jobStatuses: {},
    };
  }
  
  /**
   * Add scheduled job
   */
  addJob(id: string, name: string, schedule: string, handler: JobHandler): ScheduledJob {
    const job: ScheduledJob = {
      id,
      name,
      schedule,
      handler,
      enabled: true,
      runCount: 0,
      errorCount: 0,
      nextRun: CronParser.parse(schedule),
    };
    
    this.jobs.set(id, job);
    this.updateHealthStatus();
    
    return job;
  }
  
  /**
   * Remove job
   */
  removeJob(id: string): boolean {
    const deleted = this.jobs.delete(id);
    if (deleted) {
      this.updateHealthStatus();
    }
    return deleted;
  }
  
  /**
   * Enable job
   */
  enableJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (job) {
      job.enabled = true;
      job.nextRun = CronParser.parse(job.schedule);
      return true;
    }
    return false;
  }
  
  /**
   * Disable job
   */
  disableJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (job) {
      job.enabled = false;
      job.nextRun = undefined;
      return true;
    }
    return false;
  }
  
  /**
   * Get job
   */
  getJob(id: string): ScheduledJob | undefined {
    return this.jobs.get(id);
  }
  
  /**
   * Get all jobs
   */
  getJobs(): ScheduledJob[] {
    return Array.from(this.jobs.values());
  }
  
  /**
   * Start scheduler
   */
  start(): void {
    if (this.intervalId) return;
    
    // Check for jobs to run every second
    this.intervalId = setInterval(() => this.tick(), 1000);
    
    // Health checks
    if (this.config.enableHealthChecks) {
      this.healthCheckId = setInterval(() => this.healthCheck(), this.config.healthCheckInterval);
    }
  }
  
  /**
   * Stop scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    
    if (this.healthCheckId) {
      clearInterval(this.healthCheckId);
      this.healthCheckId = undefined;
    }
  }
  
  /**
   * Tick - check and run due jobs
   */
  private async tick(): Promise<void> {
    const now = Date.now();
    
    for (const job of this.jobs.values()) {
      if (!job.enabled) continue;
      if (this.runningJobs.size >= this.config.maxConcurrent) break;
      
      // Check if job is already running
      if (this.runningJobs.has(job.id)) continue;
      
      // Check if it's time to run
      if (job.nextRun && now >= job.nextRun) {
        this.runJob(job);
      }
    }
  }
  
  /**
   * Run a job
   */
  private async runJob(job: ScheduledJob): Promise<void> {
    const startTime = Date.now();
    
    // Emit job start event
    this.emit('scheduler:job-start', { jobId: job.id, name: job.name });
    
    const running: RunningJob = {
      job,
      startedAt: Date.now(),
      promise: (async () => {
        try {
          job.lastRun = Date.now();
          this.runningJobs.set(job.id, running);
          this.updateHealthStatus();
          
          await job.handler();
          
          job.runCount++;
          job.nextRun = CronParser.parse(job.schedule);
          
          // Emit job end event
          this.emit('scheduler:job-end', { 
            jobId: job.id, 
            name: job.name, 
            duration: Date.now() - startTime 
          });
        } catch (error) {
          job.errorCount++;
          job.lastError = error instanceof Error ? error.message : String(error);
          
          // Emit job error event
          this.emit('scheduler:job-error', { 
            jobId: job.id, 
            name: job.name, 
            error: job.lastError 
          });
        } finally {
          this.runningJobs.delete(job.id);
          this.updateHealthStatus();
        }
      })(),
    };
    
    this.runningJobs.set(job.id, running);
    
    // Don't await - run in background
    running.promise.catch(() => {}); // Errors handled in promise
  }
  
  /**
   * Run job immediately (manual trigger)
   */
  async runJobNow(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) {
      throw createError({
        code: ErrorCode.NOT_IMPLEMENTED,
        message: `Job not found: ${id}`,
        statusCode: 404,
      });
    }
    
    if (this.runningJobs.has(id)) {
      throw createError({
        code: ErrorCode.RATE_LIMITED,
        message: `Job already running: ${id}`,
        statusCode: 409,
      });
    }
    
    await this.runJob(job);
    await this.runningJobs.get(id)?.promise;
  }
  
  /**
   * Health check
   */
  private healthCheck(): void {
    this.healthStatus.lastHealthCheck = Date.now();
    
    // Check for stuck jobs
    const now = Date.now();
    for (const [id, running] of this.runningJobs) {
      const stuckTime = now - running.startedAt;
      if (stuckTime > 300000) { // 5 minutes
        this.healthStatus.healthy = false;
        break;
      }
    }
    
    this.updateHealthStatus();
  }
  
  /**
   * Update health status
   */
  private updateHealthStatus(): void {
    this.healthStatus.jobsRunning = this.runningJobs.size;
    this.healthStatus.jobsTotal = this.jobs.size;
    this.healthStatus.jobStatuses = {};
    
    for (const job of this.jobs.values()) {
      this.healthStatus.jobStatuses[job.id] = {
        lastRun: job.lastRun ?? 0,
        lastError: job.lastError,
        runCount: job.runCount,
      };
    }
  }
  
  /**
   * Get health status
   */
  getHealth(): HealthStatus {
    return { ...this.healthStatus };
  }
  
  /**
   * Check if healthy
   */
  isHealthy(): boolean {
    return this.healthStatus.healthy;
  }
}

/**
 * Heartbeat - simple periodic health check
 */
export class Heartbeat extends EventEmitter<Omit<SchedulerEvents, 'scheduler:job-start' | 'scheduler:job-end' | 'scheduler:job-error' | 'scheduler:job-missed'>> {
  private name: string;
  private intervalMs: number;
  private lastBeat: number = 0;
  private timeoutId?: ReturnType<typeof setTimeout>;
  private onMissed?: () => void;
  private onBeat?: () => void;
  
  constructor(name: string, intervalMs: number = 60000) {
    super();
    this.name = name;
    this.intervalMs = intervalMs;
  }
  
  /**
   * Start heartbeat
   */
  start(onBeat?: () => void, onMissed?: () => void): void {
    this.onBeat = onBeat;
    this.onMissed = onMissed;
    this.beat();
  }
  
  /**
   * Beat - record a heartbeat
   */
  beat(): void {
    this.lastBeat = Date.now();
    this.onBeat?.();
    
    // Emit heartbeat beat event
    this.emit('scheduler:heartbeat-beat', { service: this.name });
    
    // Schedule next beat check
    this.timeoutId = setTimeout(() => {
      this.checkMissed();
    }, this.intervalMs * 2);
  }
  
  /**
   * Check if heartbeat was missed
   */
  private checkMissed(): void {
    const timeSinceBeat = Date.now() - this.lastBeat;
    if (timeSinceBeat > this.intervalMs * 2) {
      this.emit('scheduler:heartbeat-missed', { service: this.name, timeSinceBeat });
      this.onMissed?.();
    }
  }
  
  /**
   * Get time since last beat
   */
  getTimeSinceBeat(): number {
    return Date.now() - this.lastBeat;
  }
  
  /**
   * Is alive (heartbeat received recently)
   */
  isAlive(maxDelayMs?: number): boolean {
    const delay = maxDelayMs ?? this.intervalMs * 2;
    return this.getTimeSinceBeat() < delay;
  }
  
  /**
   * Stop heartbeat
   */
  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }
}

/**
 * Create Scheduler
 */
export function createScheduler(config?: Partial<SchedulerConfig>): Scheduler {
  return new Scheduler(config);
}

/**
 * Create Heartbeat
 */
export function createHeartbeat(name: string, intervalMs?: number): Heartbeat {
  return new Heartbeat(name, intervalMs);
}
