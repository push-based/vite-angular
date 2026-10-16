import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ToastService} from './toast';

describe('ToastService', () => {
  let toasts: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    toasts = TestBed.inject(ToastService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is one root instance', () => {
    expect(TestBed.inject(ToastService)).toBe(toasts);
  });

  it('shows a toast with info tone by default', () => {
    toasts.show('Saved');
    expect(toasts.toasts()).toEqual([{id: 1, message: 'Saved', tone: 'info'}]);
  });

  it('keeps only the four newest toasts', () => {
    for (const message of ['a', 'b', 'c', 'd', 'e']) {
      toasts.show(message, 'success');
    }
    expect(toasts.toasts().map((t) => t.message)).toEqual(['b', 'c', 'd', 'e']);
  });

  it('dismisses each toast after 3.2 seconds', () => {
    toasts.show('first');
    vi.advanceTimersByTime(1000);
    toasts.show('second', 'warning');

    vi.advanceTimersByTime(2200);
    expect(toasts.toasts().map((t) => t.message)).toEqual(['second']);

    vi.advanceTimersByTime(1000);
    expect(toasts.toasts()).toEqual([]);
  });
});
