import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AdminHomePage from '../page';

describe('AdminHomePage', () => {
  it('renders the BeautyBook Admin heading', () => {
    render(<AdminHomePage />);

    expect(screen.getByRole('heading', { name: 'BeautyBook Admin' })).toBeInTheDocument();
  });
});
