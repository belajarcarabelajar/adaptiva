import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Accordion from './Accordion';

describe('Accordion component', () => {
  it('renders title string and collapsed content by default', () => {
    render(
      <Accordion title="Accordion Title">
        <p>Hidden Content</p>
      </Accordion>
    );

    expect(screen.getByText('Accordion Title')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Content')).not.toBeInTheDocument();
  });

  it('renders content when startOpen is true', () => {
    render(
      <Accordion title="Open Title" startOpen={true}>
        <p>Visible Content</p>
      </Accordion>
    );

    expect(screen.getByText('Visible Content')).toBeInTheDocument();
  });

  it('toggles content visibility when clicking header', () => {
    render(
      <Accordion title="Toggle Title">
        <p>Toggled Content</p>
      </Accordion>
    );

    const button = screen.getByRole('button', { name: /Toggle Title/i });
    expect(screen.queryByText('Toggled Content')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByText('Toggled Content')).toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.queryByText('Toggled Content')).not.toBeInTheDocument();
  });

  it('supports custom React element titles', () => {
    render(
      <Accordion title={<span data-testid="custom-title">Custom Header</span>}>
        <p>Child Text</p>
      </Accordion>
    );

    expect(screen.getByTestId('custom-title')).toBeInTheDocument();
  });
});
