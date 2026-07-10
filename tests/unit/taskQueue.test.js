import { describe, it, expect } from 'vitest';
import { createTaskQueue } from '../../src/services/taskQueue.js';

describe('taskQueue', () => {
    it('never runs more tasks than the concurrency bound', async () => {
        const queue = createTaskQueue({ concurrency: 2 });
        let active = 0;
        let maxActive = 0;

        const tasks = Array.from({ length: 10 }, () =>
            queue.add(async () => {
                active++;
                maxActive = Math.max(maxActive, active);
                await new Promise((resolve) => setTimeout(resolve, 5));
                active--;
            })
        );
        await Promise.all(tasks);

        expect(maxActive).toBe(2);
        expect(queue.size).toBe(0);
    });

    it('resolves with the task return value', async () => {
        const queue = createTaskQueue();
        expect(await queue.add(async () => 42)).toBe(42);
    });

    it('propagates rejections without breaking the queue', async () => {
        const queue = createTaskQueue({ concurrency: 1 });
        await expect(queue.add(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        expect(await queue.add(async () => 'still works')).toBe('still works');
    });
});
