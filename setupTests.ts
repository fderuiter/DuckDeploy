import '@testing-library/jest-dom';
import 'jest-axe/extend-expect';
import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { toHaveNoViolations } from 'jest-axe';

expect.extend(matchers);
expect.extend(toHaveNoViolations);
