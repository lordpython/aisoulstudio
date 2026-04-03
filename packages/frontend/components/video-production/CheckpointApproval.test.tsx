/**
 * CheckpointApproval Component Tests
 *
 * Tests: approval flow, change request flow, timeout handling
 * Requirements: 17.1, 17.2, 17.3, 17.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CheckpointApproval } from './CheckpointApproval';

// Suppress framer-motion in test env
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, ...props }: any) => (
      <div className={className} {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('CheckpointApproval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const defaultProps = {
    checkpointId: 'cp_test_001',
    phase: 'script-review',
    title: 'Review Script',
    onApprove: vi.fn(),
    onRequestChanges: vi.fn(),
  };

  describe('Approval flow', () => {
    it('should render with title and phase', () => {
      render(<CheckpointApproval {...defaultProps} />);
      expect(screen.getByText('Review Script')).toBeTruthy();
      expect(screen.getByText('script-review')).toBeTruthy();
    });

    it('should call onApprove with checkpointId when Approve is clicked', () => {
      const onApprove = vi.fn();
      render(<CheckpointApproval {...defaultProps} onApprove={onApprove} />);

      fireEvent.click(screen.getByText('Approve'));
      expect(onApprove).toHaveBeenCalledWith('cp_test_001');
    });

    it('should render preview data when provided', () => {
      render(
        <CheckpointApproval
          {...defaultProps}
          previewData={<span>Preview content here</span>}
        />,
      );
      expect(screen.getByText('Preview content here')).toBeTruthy();
    });

    it('should render description when provided', () => {
      render(
        <CheckpointApproval
          {...defaultProps}
          description="Check the generated script"
        />,
      );
      expect(screen.getByText('Check the generated script')).toBeTruthy();
    });
  });

  describe('Change request flow', () => {
    it('should show textarea when Request Changes is clicked', () => {
      render(<CheckpointApproval {...defaultProps} />);

      fireEvent.click(screen.getByText('Request Changes'));
      expect(screen.getByPlaceholderText('Describe what should be changed...')).toBeTruthy();
    });

    it('should call onRequestChanges with change text', () => {
      const onRequestChanges = vi.fn();
      render(
        <CheckpointApproval {...defaultProps} onRequestChanges={onRequestChanges} />,
      );

      fireEvent.click(screen.getByText('Request Changes'));
      const textarea = screen.getByPlaceholderText('Describe what should be changed...');
      fireEvent.change(textarea, { target: { value: 'Make it shorter' } });
      fireEvent.click(screen.getByText('Submit Changes'));

      expect(onRequestChanges).toHaveBeenCalledWith('cp_test_001', 'Make it shorter');
    });

    it('should not submit empty change requests', () => {
      const onRequestChanges = vi.fn();
      render(
        <CheckpointApproval {...defaultProps} onRequestChanges={onRequestChanges} />,
      );

      fireEvent.click(screen.getByText('Request Changes'));
      fireEvent.click(screen.getByText('Submit Changes'));

      expect(onRequestChanges).not.toHaveBeenCalled();
    });

    it('should hide textarea when Cancel is clicked', () => {
      render(<CheckpointApproval {...defaultProps} />);

      fireEvent.click(screen.getByText('Request Changes'));
      expect(screen.getByPlaceholderText('Describe what should be changed...')).toBeTruthy();

      // Button text changes to "Cancel"
      fireEvent.click(screen.getByText('Cancel'));
      expect(screen.queryByPlaceholderText('Describe what should be changed...')).toBeNull();
    });
  });

  describe('Timeout handling', () => {
    it('should show countdown timer', () => {
      render(<CheckpointApproval {...defaultProps} timeoutMs={60_000} />);
      // Should show ~1:00
      expect(screen.getByText('1:00')).toBeTruthy();
    });

    it('should show warning banner at 5 minutes remaining', () => {
      render(<CheckpointApproval {...defaultProps} timeoutMs={10 * 60 * 1000} />);

      // Advance to 5 min remaining (5 min elapsed of 10 min total)
      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });

      expect(screen.getByText(/auto-save/i)).toBeTruthy();
    });

    it('should call onTimeout when timer expires', () => {
      const onTimeout = vi.fn();
      render(
        <CheckpointApproval {...defaultProps} timeoutMs={5000} onTimeout={onTimeout} />,
      );

      act(() => {
        vi.advanceTimersByTime(5100);
      });

      expect(onTimeout).toHaveBeenCalledWith('cp_test_001');
    });

    it('should show auto-saved notification after timeout', () => {
      render(<CheckpointApproval {...defaultProps} timeoutMs={5000} />);

      act(() => {
        vi.advanceTimersByTime(5100);
      });

      expect(screen.getByText(/auto-saved/i)).toBeTruthy();
    });

    it('should disable buttons after timeout', () => {
      render(<CheckpointApproval {...defaultProps} timeoutMs={5000} />);

      act(() => {
        vi.advanceTimersByTime(5100);
      });

      const approveBtn = screen.getByLabelText('Approve checkpoint');
      expect(approveBtn).toHaveProperty('disabled', true);
    });
  });
});
