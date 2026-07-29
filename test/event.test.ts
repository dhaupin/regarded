/**
 * Event Module Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter, events, on, once, off, emit, TradingEvents } from '../lib/event';

describe('EventEmitter', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  it('should subscribe and emit events', () => {
    const callback = vi.fn();
    emitter.on('test', callback);
    emitter.emit('test', { data: 'hello' });
    
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ data: 'hello' });
  });

  it('should support multiple subscribers', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    
    emitter.on('test', callback1);
    emitter.on('test', callback2);
    emitter.emit('test');
    
    expect(callback1).toHaveBeenCalled();
    expect(callback2).toHaveBeenCalled();
  });

  it('should unsubscribe events', () => {
    const callback = vi.fn();
    emitter.on('test', callback);
    emitter.off('test', callback);
    emitter.emit('test');
    
    expect(callback).not.toHaveBeenCalled();
  });

  it('should handle one-time events', () => {
    const callback = vi.fn();
    emitter.once('test', callback);
    
    emitter.emit('test');
    emitter.emit('test');
    
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should remove all listeners', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    
    emitter.on('test1', callback1);
    emitter.on('test2', callback2);
    
    emitter.removeAllListeners();
    
    emitter.emit('test1');
    emitter.emit('test2');
    
    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).not.toHaveBeenCalled();
  });

  it('should remove listeners for specific event', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    
    emitter.on('test1', callback1);
    emitter.on('test2', callback2);
    
    emitter.removeAllListeners('test1');
    
    emitter.emit('test1');
    emitter.emit('test2');
    
    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalled();
  });

  it('should track listener count', () => {
    expect(emitter.listenerCount('test')).toBe(0);
    
    emitter.on('test', () => {});
    expect(emitter.listenerCount('test')).toBe(1);
    
    emitter.on('test', () => {});
    expect(emitter.listenerCount('test')).toBe(2);
  });

  it('should handle errors gracefully', () => {
    const callback = vi.fn(() => { throw new Error('Test error'); });
    emitter.on('test', callback);
    
    expect(() => emitter.emit('test')).not.toThrow();
  });

  describe('Global events', () => {
    it('should export TradingEvents', () => {
      expect(TradingEvents.RULE_TRIGGERED).toBe('rule:triggered');
      expect(TradingEvents.TRADE_EXECUTED).toBe('trade:executed');
      expect(TradingEvents.PRICE_UPDATED).toBe('price:updated');
    });

    it('should use convenience methods', () => {
      const callback = vi.fn();
      
      on('test', callback);
      emit('test', { data: 123 });
      
      expect(callback).toHaveBeenCalledWith({ data: 123 });
      
      off('test', callback);
    });
  });
});
