/**
 * Event System
 * 
 * Simple event emitter for reactive updates when rules trigger.
 * Inspired by Vant's event system.
 */

type EventCallback<T = any> = (data: T) => void;

interface EventMap {
  [event: string]: EventCallback[];
}

/**
 * Generic Event Emitter
 */
export class EventEmitter<Events extends Record<string, any> = Record<string, any>> {
  private events: EventMap = {};
  private onceEvents: EventMap = {};
  
  /**
   * Subscribe to an event
   */
  on<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): () => void {
    if (!this.events[event as string]) this.events[event as string] = [];
    this.events[event as string].push(callback as EventCallback);
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }
  
  /**
   * Subscribe to an event once
   */
  once<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): void {
    if (!this.onceEvents[event as string]) this.onceEvents[event as string] = [];
    this.onceEvents[event as string].push(callback as EventCallback);
  }
  
  /**
   * Unsubscribe from an event
   */
  off<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): void {
    if (this.events[event as string]) {
      this.events[event as string] = this.events[event as string].filter(cb => cb !== callback);
    }
  }
  
  /**
   * Emit an event
   */
  emit<K extends keyof Events>(event: K, data?: Events[K]): void {
    // Handle one-time listeners
    if (this.onceEvents[event as string]) {
      for (const callback of this.onceEvents[event as string]) {
        try { callback(data); } catch (e) { console.error(`Event error: ${event}`, e); }
      }
      delete this.onceEvents[event as string];
    }
    
    // Handle persistent listeners
    if (this.events[event as string]) {
      for (const callback of this.events[event as string]) {
        try { callback(data); } catch (e) { console.error(`Event error: ${event}`, e); }
      }
    }
  }
  
  /**
   * Remove all listeners for an event
   */
  removeAllListeners(event?: string): void {
    if (event) {
      delete this.events[event];
      delete this.onceEvents[event];
    } else {
      this.events = {};
      this.onceEvents = {};
    }
  }
  
  /**
   * Get listener count
   */
  listenerCount(event: string): number {
    return (this.events[event]?.length || 0) + (this.onceEvents[event]?.length || 0);
  }
}

/**
 * Global event emitter instance
 */
export const events = new EventEmitter();

// Convenience methods
export const on = (event: string, callback: EventCallback) => events.on(event as any, callback);
export const once = (event: string, callback: EventCallback) => events.once(event as any, callback);
export const off = (event: string, callback: EventCallback) => events.off(event as any, callback);
export const emit = (event: string, data?: any) => events.emit(event as any, data);

// Named event exports for type safety
export const TradingEvents = {
  RULE_TRIGGERED: 'rule:triggered',
  TRADE_EXECUTED: 'trade:executed',
  POSITION_OPENED: 'position:opened',
  POSITION_CLOSED: 'position:closed',
  PRICE_UPDATED: 'price:updated',
  INDICATOR_CALCULATED: 'indicator:calculated',
  PATTERN_DETECTED: 'pattern:detected',
  ERROR: 'error',
} as const;
