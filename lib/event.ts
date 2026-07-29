/**
 * Event System
 * 
 * Simple event emitter for reactive updates when rules trigger.
 * Inspired by Vant's event system.
 */

type EventCallback = (data: any) => void;

interface EventMap {
  [event: string]: EventCallback[];
}

/**
 * Event Emitter
 */
export class EventEmitter {
  private events: EventMap = {};
  private onceEvents: EventMap = {};
  
  /**
   * Subscribe to an event
   */
  on(event: string, callback: EventCallback): () => void {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }
  
  /**
   * Subscribe to an event once
   */
  once(event: string, callback: EventCallback): void {
    if (!this.onceEvents[event]) this.onceEvents[event] = [];
    this.onceEvents[event].push(callback);
  }
  
  /**
   * Unsubscribe from an event
   */
  off(event: string, callback: EventCallback): void {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter(cb => cb !== callback);
    }
  }
  
  /**
   * Emit an event
   */
  emit(event: string, data?: any): void {
    // Handle one-time listeners
    if (this.onceEvents[event]) {
      for (const callback of this.onceEvents[event]) {
        try { callback(data); } catch (e) { console.error(`Event error: ${event}`, e); }
      }
      delete this.onceEvents[event];
    }
    
    // Handle persistent listeners
    if (this.events[event]) {
      for (const callback of this.events[event]) {
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
export const on = (event: string, callback: EventCallback) => events.on(event, callback);
export const once = (event: string, callback: EventCallback) => events.once(event, callback);
export const off = (event: string, callback: EventCallback) => events.off(event, callback);
export const emit = (event: string, data?: any) => events.emit(event, data);

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
