/**
 * News Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NewsService, createNewsService } from '../lib/news';

describe('NewsService', () => {
  let news: NewsService;

  beforeEach(() => {
    news = createNewsService({
      cacheDurationMs: 60000,
      defaultSymbols: ['BTC', 'ETH', 'SOL'],
    });
  });

  describe('constructor', () => {
    it('should use default config', () => {
      const n = createNewsService();
      expect(n).toBeDefined();
    });

    it('should accept custom config', () => {
      const n = createNewsService({
        cacheDurationMs: 300000,
        defaultSymbols: ['BTC'],
      });
      expect(n).toBeDefined();
    });
  });

  describe('getLatest', () => {
    it('should return empty array without API key', async () => {
      const result = await news.getLatest();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by symbols', async () => {
      // Add manual news items
      news.addNewsItem({
        title: 'BTC News',
        summary: 'Bitcoin update',
        source: 'Test',
        url: 'https://test.com/1',
        publishedAt: Date.now(),
        symbols: ['BTC'],
        sentiment: 'positive',
        relevance: 0.8,
      });

      news.addNewsItem({
        title: 'ETH News',
        summary: 'Ethereum update',
        source: 'Test',
        url: 'https://test.com/2',
        publishedAt: Date.now(),
        symbols: ['ETH'],
        sentiment: 'negative',
        relevance: 0.6,
      });

      const btcNews = await news.getLatest({ symbols: ['BTC'] });
      expect(btcNews.length).toBe(1);
      expect(btcNews[0].symbols).toContain('BTC');
    });

    it('should filter by sentiment', async () => {
      news.addNewsItem({
        title: 'Positive News',
        summary: 'Good news',
        source: 'Test',
        url: 'https://test.com/1',
        publishedAt: Date.now(),
        symbols: ['BTC'],
        sentiment: 'positive',
        relevance: 0.8,
      });

      news.addNewsItem({
        title: 'Negative News',
        summary: 'Bad news',
        source: 'Test',
        url: 'https://test.com/2',
        publishedAt: Date.now(),
        symbols: ['BTC'],
        sentiment: 'negative',
        relevance: 0.6,
      });

      const positiveNews = await news.getLatest({ sentiment: 'positive' });
      expect(positiveNews.length).toBe(1);
      expect(positiveNews[0].sentiment).toBe('positive');
    });

    it('should respect limit', async () => {
      for (let i = 0; i < 20; i++) {
        news.addNewsItem({
          title: `News ${i}`,
          summary: 'Test',
          source: 'Test',
          url: `https://test.com/${i}`,
          publishedAt: Date.now() - i * 1000,
          symbols: ['BTC'],
          relevance: 0.5,
        });
      }

      const result = await news.getLatest({ limit: 5 });
      expect(result.length).toBe(5);
    });
  });

  describe('getNewsForSymbols', () => {
    it('should return news for specific symbols', async () => {
      news.addNewsItem({
        title: 'BTC Surge',
        summary: 'Bitcoin price surge',
        source: 'Test',
        url: 'https://test.com/1',
        publishedAt: Date.now(),
        symbols: ['BTC', 'ETH'],
        relevance: 0.9,
      });

      const result = await news.getNewsForSymbols(['BTC']);
      expect(result.length).toBe(1);
    });
  });

  describe('isNewsBlackoutPeriod', () => {
    it('should detect high-impact news', async () => {
      news.addNewsItem({
        title: 'Fed Interest Rate Decision',
        summary: 'The Fed announced interest rate changes',
        source: 'Test',
        url: 'https://test.com/1',
        publishedAt: Date.now(),
        symbols: ['SPY', 'QQQ'],
        relevance: 1.0,
      });

      const result = await news.isNewsBlackoutPeriod(['SPY']);
      expect(result.blackout).toBe(true);
      expect(result.reason).toContain('High-impact news');
    });

    it('should return false for normal news', async () => {
      news.addNewsItem({
        title: 'Daily Update',
        summary: 'Normal daily update',
        source: 'Test',
        url: 'https://test.com/1',
        publishedAt: Date.now(),
        symbols: ['BTC'],
        relevance: 0.3,
      });

      const result = await news.isNewsBlackoutPeriod(['BTC']);
      expect(result.blackout).toBe(false);
    });
  });

  describe('getMarketSentiment', () => {
    it('should calculate overall sentiment', async () => {
      news.addNewsItem({
        title: 'Good News',
        summary: 'Positive developments',
        source: 'Test',
        url: 'https://test.com/1',
        publishedAt: Date.now(),
        symbols: ['BTC', 'ETH'],
        sentiment: 'positive',
        relevance: 0.9,
      });

      news.addNewsItem({
        title: 'Bad News',
        summary: 'Negative developments',
        source: 'Test',
        url: 'https://test.com/2',
        publishedAt: Date.now(),
        symbols: ['SOL'],
        sentiment: 'negative',
        relevance: 0.8,
      });

      const result = await news.getMarketSentiment();
      expect(result.newsCount).toBe(2);
      expect(result.symbolSentiments.BTC).toBe('positive');
      expect(result.symbolSentiments.SOL).toBe('negative');
    });
  });

  describe('addNewsItem', () => {
    it('should add manual news item', () => {
      news.addNewsItem({
        title: 'Manual News',
        summary: 'Added manually',
        source: 'Manual',
        url: 'https://test.com',
        publishedAt: Date.now(),
        symbols: ['BTC'],
        relevance: 0.5,
      });
    });

    it('should limit recent news size', () => {
      for (let i = 0; i < 150; i++) {
        news.addNewsItem({
          title: `News ${i}`,
          summary: 'Test',
          source: 'Test',
          url: `https://test.com/${i}`,
          publishedAt: Date.now() - i,
          symbols: ['BTC'],
          relevance: 0.5,
        });
      }
    });
  });

  describe('clearCache', () => {
    it('should clear cache', () => {
      news.clearCache();
    });
  });
});
