import { describe, expect, it } from 'vitest';
import type { MetricsSnapshot } from '../types.js';
import { formatBytes, formatDuration, generateSummary } from '../reporter.js';

describe('generateSummary', () => {
  it('returns empty summary for no snapshots', () => {
    const summary = generateSummary([]);
    expect(summary.totalDuration).toBe(0);
    expect(summary.avgMemoryUsedMB).toBe(0);
    expect(summary.peakMemoryUsedMB).toBe(0);
    expect(summary.totalRequestCount).toBe(0);
  });

  it('calculates summary from multiple snapshots', () => {
    const snapshots: MetricsSnapshot[] = [
      {
        timestamp: 1000,
        label: 'test1',
        duration: 100,
        memory: {
          timestamp: 1000,
          usedJSHeapSize: 10 * 1024 * 1024, // 10 MB
          totalJSHeapSize: 20 * 1024 * 1024,
          jsHeapSizeLimit: 100 * 1024 * 1024,
          documents: 5,
          nodes: 100,
          jsEventListeners: 10,
        },
        performance: {
          timestamp: 1000,
          taskDuration: 50,
          scriptDuration: 30,
          layoutDuration: 10,
          recalcStyleDuration: 5,
          layoutCount: 2,
          recalcStyleCount: 3,
        },
        network: {
          timestamp: 1000,
          totalRequests: 10,
          totalTransferSize: 1024 * 1024, // 1 MB
          totalEncodedBodySize: 512 * 1024,
          totalDecodedBodySize: 1024 * 1024,
          requestsByType: new Map([['script', 5], ['document', 1], ['image', 4]]),
          transferByType: new Map([
            ['script', 512 * 1024],
            ['document', 256 * 1024],
            ['image', 256 * 1024],
          ]),
        },
        resources: [],
      },
      {
        timestamp: 2000,
        label: 'test2',
        duration: 200,
        memory: {
          timestamp: 2000,
          usedJSHeapSize: 20 * 1024 * 1024, // 20 MB
          totalJSHeapSize: 30 * 1024 * 1024,
          jsHeapSizeLimit: 100 * 1024 * 1024,
          documents: 8,
          nodes: 150,
          jsEventListeners: 15,
        },
        performance: {
          timestamp: 2000,
          taskDuration: 60,
          scriptDuration: 40,
          layoutDuration: 15,
          recalcStyleDuration: 8,
          layoutCount: 3,
          recalcStyleCount: 4,
        },
        network: {
          timestamp: 2000,
          totalRequests: 15,
          totalTransferSize: 2 * 1024 * 1024, // 2 MB
          totalEncodedBodySize: 1024 * 1024,
          totalDecodedBodySize: 2 * 1024 * 1024,
          requestsByType: new Map([['script', 8], ['document', 2], ['image', 5]]),
          transferByType: new Map([
            ['script', 1024 * 1024],
            ['document', 512 * 1024],
            ['image', 512 * 1024],
          ]),
        },
        resources: [],
      },
    ];

    const summary = generateSummary(snapshots);

    expect(summary.totalDuration).toBe(300);
    expect(summary.avgMemoryUsedMB).toBe(15); // (10 + 20) / 2
    expect(summary.peakMemoryUsedMB).toBe(20);
    expect(summary.totalRequestCount).toBe(25); // 10 + 15
    expect(summary.totalTransferSizeMB).toBe(3); // 1 + 2
    expect(summary.avgTaskDurationMs).toBe(55); // (50 + 60) / 2
    expect(summary.avgScriptDurationMs).toBe(35); // (30 + 40) / 2
    expect(summary.avgLayoutDurationMs).toBe(12.5); // (10 + 15) / 2

    // Check aggregated transfer by type
    expect(summary.transferByType.get('script')).toBe(1.5 * 1024 * 1024); // 0.5 + 1
    expect(summary.transferByType.get('document')).toBe(0.75 * 1024 * 1024); // 0.25 + 0.5
    expect(summary.transferByType.get('image')).toBe(0.75 * 1024 * 1024); // 0.25 + 0.5
  });

  it('handles snapshots with resources', () => {
    const snapshots: MetricsSnapshot[] = [
      {
        timestamp: 1000,
        label: 'test',
        duration: 100,
        memory: {
          timestamp: 1000,
          usedJSHeapSize: 10 * 1024 * 1024,
          totalJSHeapSize: 20 * 1024 * 1024,
          jsHeapSizeLimit: 100 * 1024 * 1024,
          documents: 5,
          nodes: 100,
          jsEventListeners: 10,
        },
        performance: {
          timestamp: 1000,
          taskDuration: 50,
          scriptDuration: 30,
          layoutDuration: 10,
          recalcStyleDuration: 5,
          layoutCount: 2,
          recalcStyleCount: 3,
        },
        network: {
          timestamp: 1000,
          totalRequests: 2,
          totalTransferSize: 2 * 1024 * 1024,
          totalEncodedBodySize: 1024 * 1024,
          totalDecodedBodySize: 2 * 1024 * 1024,
          requestsByType: new Map([['script', 2]]),
          transferByType: new Map([['script', 2 * 1024 * 1024]]),
        },
        resources: [
          {
            url: 'https://example.com/large.js',
            type: 'script',
            method: 'GET',
            status: 200,
            startTime: 0,
            duration: 500,
            encodedBodySize: 512 * 1024,
            decodedBodySize: 1024 * 1024,
            transferSize: 1024 * 1024,
          },
          {
            url: 'https://example.com/small.js',
            type: 'script',
            method: 'GET',
            status: 200,
            startTime: 100,
            duration: 100,
            encodedBodySize: 512 * 1024,
            decodedBodySize: 1024 * 1024,
            transferSize: 1024 * 1024,
          },
        ],
      },
    ];

    const summary = generateSummary(snapshots);

    expect(summary.topResourcesBySize).toHaveLength(2);
    expect(summary.topResourcesBySize[0].url).toBe('https://example.com/large.js');
    expect(summary.topResourcesByDuration).toHaveLength(2);
    expect(summary.topResourcesByDuration[0].duration).toBe(500);
  });
});

describe('formatBytes', () => {
  it('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(500)).toBe('500.00 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
    expect(formatBytes(1536 * 1024)).toBe('1.50 MB');
  });
});

describe('formatDuration', () => {
  it('formats duration correctly', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
    expect(formatDuration(1000)).toBe('1.00s');
    expect(formatDuration(1500)).toBe('1.50s');
    expect(formatDuration(60000)).toBe('60.00s');
  });
});
