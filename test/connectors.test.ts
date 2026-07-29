/**
 * Connectors Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KrakenConnector, SolanaConnector, JupiterConnector, ConnectorRegistry, createConnector, connectors } from '../lib/connectors';

describe('Connectors', () => {
  describe('Base functionality', () => {
    it('should create Kraken connector', () => {
      const connector = new KrakenConnector();
      expect(connector.name).toBe('Kraken');
      expect(connector.exchange).toBe('kraken');
    });

    it('should create Solana connector', () => {
      const connector = new SolanaConnector();
      expect(connector.name).toBe('Solana Wallet');
      expect(connector.exchange).toBe('solana');
    });

    it('should create Jupiter connector', () => {
      const connector = new JupiterConnector();
      expect(connector.name).toBe('Jupiter');
      expect(connector.exchange).toBe('jupiter');
    });
  });

  describe('KrakenConnector', () => {
    let kraken: KrakenConnector;

    beforeEach(() => {
      kraken = new KrakenConnector();
    });

    it('should connect', async () => {
      const result = await kraken.connect({ ciphertext: '', iv: '', auth_tag: '', key_id: '', encrypted_by: '', created_at: 0, updated_at: 0, version: 1 });
      expect(result).toBe(true);
      expect(kraken.isConnected()).toBe(true);
    });

    it('should disconnect', async () => {
      await kraken.connect({ ciphertext: '', iv: '', auth_tag: '', key_id: '', encrypted_by: '', created_at: 0, updated_at: 0, version: 1 });
      await kraken.disconnect();
      expect(kraken.isConnected()).toBe(false);
    });

    it('should get balance in paper mode', async () => {
      await kraken.connect({ ciphertext: '', iv: '', auth_tag: '', key_id: '', encrypted_by: '', created_at: 0, updated_at: 0, version: 1 });
      const balances = await kraken.getBalance();
      
      expect(Array.isArray(balances)).toBe(true);
      expect(balances.length).toBeGreaterThan(0);
      expect(balances[0]).toHaveProperty('asset');
      expect(balances[0]).toHaveProperty('free');
    });

    it('should get price', async () => {
      await kraken.connect({ ciphertext: '', iv: '', auth_tag: '', key_id: '', encrypted_by: '', created_at: 0, updated_at: 0, version: 1 });
      const price = await kraken.getPrice('SOL/USD');
      
      expect(typeof price).toBe('number');
      expect(price).toBeGreaterThan(0);
    });

    it('should get prices', async () => {
      await kraken.connect({ ciphertext: '', iv: '', auth_tag: '', key_id: '', encrypted_by: '', created_at: 0, updated_at: 0, version: 1 });
      const prices = await kraken.getPrices(['SOL/USD', 'BTC/USD']);
      
      expect(prices.size).toBe(2);
      expect(prices.get('SOL/USD')).toBeGreaterThan(0);
    });

    it('should get candles', async () => {
      await kraken.connect({ ciphertext: '', iv: '', auth_tag: '', key_id: '', encrypted_by: '', created_at: 0, updated_at: 0, version: 1 });
      const candles = await kraken.getCandles('SOL/USD', '5m', 10);
      
      expect(Array.isArray(candles)).toBe(true);
      expect(candles.length).toBe(10);
      expect(candles[0]).toHaveProperty('timestamp');
      expect(candles[0]).toHaveProperty('open');
      expect(candles[0]).toHaveProperty('close');
    });

    it('should place order in paper mode', async () => {
      await kraken.connect({ ciphertext: '', iv: '', auth_tag: '', key_id: '', encrypted_by: '', created_at: 0, updated_at: 0, version: 1 });
      const result = await kraken.placeOrder({
        pair: 'SOL/USD',
        side: 'buy',
        type: 'market',
        amount: 1,
      });
      
      expect(result.id).toBeDefined();
      expect(result.status).toBe('filled');
    });

    it('should support paper trading', () => {
      expect(kraken.supportsPaperTrading()).toBe(true);
      expect(kraken.isPaperMode()).toBe(true);
    });

    it('should list supported intervals', () => {
      const intervals = kraken.supportedIntervals();
      expect(intervals).toContain('1m');
      expect(intervals).toContain('1h');
      expect(intervals).toContain('1d');
    });

    it('should list supported symbols', () => {
      const symbols = kraken.supportedSymbols();
      expect(symbols).toContain('SOL/USD');
      expect(symbols).toContain('BTC/USD');
    });
  });

  describe('SolanaConnector', () => {
    let solana: SolanaConnector;

    beforeEach(() => {
      solana = new SolanaConnector();
    });

    it('should connect', async () => {
      await solana.connect({ ciphertext: '', iv: '', auth_tag: '', key_id: '', encrypted_by: '', created_at: 0, updated_at: 0, version: 1 });
      expect(solana.isConnected()).toBe(true);
    });

    it('should get balance', async () => {
      await solana.connect({ ciphertext: '', iv: '', auth_tag: '', key_id: '', encrypted_by: '', created_at: 0, updated_at: 0, version: 1 });
      const balances = await solana.getBalance();
      
      expect(Array.isArray(balances)).toBe(true);
    });
  });

  describe('JupiterConnector', () => {
    let jupiter: JupiterConnector;

    beforeEach(() => {
      jupiter = new JupiterConnector();
    });

    it('should connect', async () => {
      await jupiter.connect({ ciphertext: '', iv: '', auth_tag: '', key_id: '', encrypted_by: '', created_at: 0, updated_at: 0, version: 1 });
      expect(jupiter.isConnected()).toBe(true);
    });

    it('should list supported symbols', () => {
      const symbols = jupiter.supportedSymbols();
      expect(symbols).toContain('SOL/USDC');
    });
  });

  describe('ConnectorRegistry', () => {
    it('should create connectors via factory', () => {
      const kraken = createConnector('kraken');
      const solana = createConnector('solana');
      const jupiter = createConnector('jupiter');
      
      expect(kraken?.name).toBe('Kraken');
      expect(solana?.name).toBe('Solana Wallet');
      expect(jupiter?.name).toBe('Jupiter');
    });

    it('should return undefined for unknown exchange', () => {
      const unknown = createConnector('unknown');
      expect(unknown).toBeUndefined();
    });

    it('should list available exchanges', () => {
      const list = connectors.list();
      expect(list).toContain('kraken');
      expect(list).toContain('solana');
      expect(list).toContain('jupiter');
    });

    it('should check if exchange is supported', () => {
      expect(connectors.has('kraken')).toBe(true);
      expect(connectors.has('unknown')).toBe(false);
    });
  });
});
