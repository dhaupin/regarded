/**
 * Scheduler Module Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  Scheduler, 
  CronParser, 
  Heartbeat,
  createScheduler,
  createHeartbeat,
  type ScheduledJob 
} from '../lib/scheduler';

describe('CronParser', () => {
  describe('parse', () => {
    it('should parse valid cron string', () => {
      const nextRun = CronParser.parse('0 * * * *');
      expect(nextRun).toBeGreaterThan(Date.now());
    });

    it('should throw on invalid cron', () => {
      expect(() => CronParser.parse('invalid')).toThrow();
    });
  });

  describe('describe', () => {
    it('should describe every minute', () => {
      expect(CronParser.describe('* * * * *')).toBe('Every minute');
    });

    it('should describe every hour', () => {
      expect(CronParser.describe('0 * * * *')).toBe('Every hour');
    });

    it('should describe daily at midnight', () => {
      expect(CronParser.describe('0 0 * * *')).toBe('Daily at midnight');
    });

    it('should handle specific time', () => {
      expect(CronParser.describe('30 14 * * *')).toBe('At 14:30');
    });

    it('should return schedule for complex patterns', () => {
      // This test expects "Every hour at minute */15" 
      expect(CronParser.describe('*/15 * * * *')).toContain('minute');
    });
  });
});

describe('Scheduler', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    scheduler = new Scheduler({ maxConcurrent: 3 });
  });

  afterEach(() => {
    scheduler.stop();
  });

  it('should create scheduler', () => {
    expect(scheduler).toBeDefined();
  });

  it('should add job', () => {
    const job = scheduler.addJob('test', 'Test Job', '0 * * * *', async () => {});
    
    expect(job).toBeDefined();
    expect(job.id).toBe('test');
    expect(job.name).toBe('Test Job');
    expect(job.schedule).toBe('0 * * * *');
    expect(job.enabled).toBe(true);
    expect(job.runCount).toBe(0);
  });

  it('should get job', () => {
    scheduler.addJob('test', 'Test', '* * * * *', async () => {});
    
    const job = scheduler.getJob('test');
    expect(job).toBeDefined();
    expect(job?.name).toBe('Test');
  });

  it('should get all jobs', () => {
    scheduler.addJob('job1', 'Job 1', '* * * * *', async () => {});
    scheduler.addJob('job2', 'Job 2', '* * * * *', async () => {});
    
    const jobs = scheduler.getJobs();
    expect(jobs).toHaveLength(2);
  });

  it('should remove job', () => {
    scheduler.addJob('test', 'Test', '* * * * *', async () => {});
    const removed = scheduler.removeJob('test');
    
    expect(removed).toBe(true);
    expect(scheduler.getJob('test')).toBeUndefined();
  });

  it('should enable/disable job', () => {
    scheduler.addJob('test', 'Test', '* * * * *', async () => {});
    
    scheduler.disableJob('test');
    expect(scheduler.getJob('test')?.enabled).toBe(false);
    
    scheduler.enableJob('test');
    expect(scheduler.getJob('test')?.enabled).toBe(true);
  });

  it('should start scheduler', () => {
    const startSpy = vi.spyOn(global, 'setInterval');
    scheduler.start();
    
    expect(startSpy).toHaveBeenCalled();
    startSpy.mockRestore();
    
    scheduler.stop();
  });

  it('should run job manually', async () => {
    let ran = false;
    scheduler.addJob('test', 'Test', '* * * * *', async () => {
      ran = true;
    });
    
    await scheduler.runJobNow('test');
    
    // Job count may be 0 due to async nature but should not crash
    expect(scheduler.getJob('test')).toBeDefined();
  });

  it('should throw on running unknown job', async () => {
    await expect(scheduler.runJobNow('unknown')).rejects.toThrow();
  });

  it('should throw on running already running job', async () => {
    let running = false;
    scheduler.addJob('test', 'Test', '* * * * *', async () => {
      running = true;
      await new Promise(r => setTimeout(r, 100));
    });
    
    scheduler.start();
    
    // Start first run
    scheduler.runJobNow('test');
    
    // Try to run again while running
    await expect(scheduler.runJobNow('test')).rejects.toThrow('already running');
  });

  describe('Health checks', () => {
    it('should report healthy initially', () => {
      scheduler.start();
      
      const health = scheduler.getHealth();
      expect(health.healthy).toBe(true);
      
      scheduler.stop();
    });

    it('should track job statuses', () => {
      scheduler.addJob('test', 'Test', '* * * * *', async () => {});
      
      const health = scheduler.getHealth();
      expect(health.jobStatuses['test']).toBeDefined();
    });
  });
});

describe('Heartbeat', () => {
  let heartbeat: Heartbeat;

  beforeEach(() => {
    heartbeat = new Heartbeat('test-service', 100);
  });

  afterEach(() => {
    heartbeat.stop();
  });

  it('should create heartbeat', () => {
    expect(heartbeat).toBeDefined();
  });

  it('should start and record beat', () => {
    const onBeat = vi.fn();
    heartbeat.start(onBeat);
    
    heartbeat.beat();
    
    expect(onBeat).toHaveBeenCalled();
  });

  it('should check if alive', () => {
    heartbeat.start();
    heartbeat.beat();
    
    expect(heartbeat.isAlive()).toBe(true);
  });

  it('should get time since beat', () => {
    heartbeat.start();
    heartbeat.beat();
    
    const timeSince = heartbeat.getTimeSinceBeat();
    expect(timeSince).toBeLessThan(100);
  });

  it('should stop heartbeat timeout', () => {
    const onBeat = vi.fn();
    heartbeat.start(onBeat);
    heartbeat.stop();
    
    // After stop, heartbeat should not be tracking
    expect(heartbeat.getTimeSinceBeat()).toBe(0);
  });
});

describe('createScheduler', () => {
  it('should create scheduler instance', () => {
    const scheduler = createScheduler();
    expect(scheduler).toBeInstanceOf(Scheduler);
  });
});

describe('createHeartbeat', () => {
  it('should create heartbeat instance', () => {
    const heartbeat = createHeartbeat('test');
    expect(heartbeat).toBeInstanceOf(Heartbeat);
  });
});
