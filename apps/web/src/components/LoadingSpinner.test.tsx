import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LoadingSpinner from './LoadingSpinner';

describe('LoadingSpinner component', () => {
  it('renders default message and accessible status role', () => {
    render(<LoadingSpinner />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders custom loading message when provided', () => {
    render(<LoadingSpinner message="Generating practice questions..." />);

    expect(screen.getByText('Generating practice questions...')).toBeInTheDocument();
  });
});
