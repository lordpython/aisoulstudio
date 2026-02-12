/**
 * Unit tests for sessionId generation and validation
 */

import { describe, it, expect } from 'vitest';
import {
    generateSessionId,
    validateContentPlanId,
    isValidSessionId,
} from '../../services/ai/production/utils';

describe('sessionId Generation and Validation', () => {
    describe('generateSessionId', () => {
        it('should generate a sessionId with prod_ prefix', () => {
            const sessionId = generateSessionId();
            expect(sessionId).toMatch(/^prod_\d+_[a-z0-9]+$/);
        });

        it('should generate unique sessionIds', () => {
            const ids = new Set<string>();
            for (let i = 0; i < 100; i++) {
                ids.add(generateSessionId());
            }
            expect(ids.size).toBe(100);
        });

        it('should include timestamp in sessionId', () => {
            const before = Date.now();
            const sessionId = generateSessionId();
            const after = Date.now();
            
            const parts = sessionId.split('_');
            const timestamp = parseInt(parts[1] || '0', 10);
            expect(timestamp).toBeGreaterThanOrEqual(before);
            expect(timestamp).toBeLessThanOrEqual(after);
        });
    });

    describe('isValidSessionId', () => {
        it('should return true for valid prod_ sessionIds', () => {
            expect(isValidSessionId('prod_1234567890_abc123def')).toBe(true);
            expect(isValidSessionId('prod_1_a')).toBe(true);
        });

        it('should return true for valid story_ sessionIds', () => {
            expect(isValidSessionId('story_1234567890')).toBe(true);
            expect(isValidSessionId('story_1')).toBe(true);
        });

        it('should return false for null or undefined', () => {
            expect(isValidSessionId(null)).toBe(false);
            expect(isValidSessionId(undefined)).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(isValidSessionId('')).toBe(false);
        });

        it('should return false for placeholder values', () => {
            expect(isValidSessionId('plan_123')).toBe(false);
            expect(isValidSessionId('cp_01')).toBe(false);
            expect(isValidSessionId('session_12345')).toBe(false);
            expect(isValidSessionId('plan_abc')).toBe(false);
            expect(isValidSessionId('cp_abc')).toBe(false);
        });

        it('should return false for invalid prefixes', () => {
            expect(isValidSessionId('invalid_123')).toBe(false);
            expect(isValidSessionId('test_123')).toBe(false);
            expect(isValidSessionId('123456')).toBe(false);
        });
    });

    describe('validateContentPlanId', () => {
        it('should return null for valid prod_ sessionIds', () => {
            expect(validateContentPlanId('prod_1234567890_abc123')).toBeNull();
        });

        it('should return null for valid story_ sessionIds', () => {
            expect(validateContentPlanId('story_1234567890')).toBeNull();
        });

        it('should return error for missing contentPlanId', () => {
            const result = validateContentPlanId('');
            expect(result).not.toBeNull();
            const parsed = JSON.parse(result!);
            expect(parsed.success).toBe(false);
            expect(parsed.error).toContain('Missing contentPlanId');
        });

        it('should return error for placeholder values', () => {
            const result = validateContentPlanId('plan_123');
            expect(result).not.toBeNull();
            const parsed = JSON.parse(result!);
            expect(parsed.success).toBe(false);
            expect(parsed.error).toContain('Invalid contentPlanId');
            expect(parsed.error).toContain('placeholder');
        });

        it('should return error for invalid format', () => {
            const result = validateContentPlanId('invalid_format');
            expect(result).not.toBeNull();
            const parsed = JSON.parse(result!);
            expect(parsed.success).toBe(false);
            expect(parsed.error).toContain('Invalid contentPlanId format');
        });
    });
});
