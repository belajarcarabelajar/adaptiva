import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { APP_TITLE, Icons } from './constants';
import React from 'react';

describe('constants', () => {
  describe('APP_TITLE', () => {
    it('should match the expected application title', () => {
      expect(APP_TITLE).toBe('Adaptiva Study');
    });
  });

  describe('Icons', () => {
    it('should be an object containing icon components', () => {
      expect(typeof Icons).toBe('object');
      expect(Object.keys(Icons).length).toBeGreaterThan(0);

      // Check that the expected icon exists
      expect(Icons.AcademicCap).toBeDefined();
    });

    it('should apply the provided className to the AcademicCap icon', () => {
      const { container } = render(<Icons.AcademicCap className="custom-test-class" />);
      const svg = container.querySelector('svg');
      expect(svg).toBeDefined();
      expect(svg?.getAttribute('class')).toContain('custom-test-class');
    });

    it('should use default className when none is provided', () => {
      const { container } = render(<Icons.AcademicCap />);
      const svg = container.querySelector('svg');
      expect(svg).toBeDefined();
      expect(svg?.getAttribute('class')).toContain('w-6 h-6');
    });
  });
});
