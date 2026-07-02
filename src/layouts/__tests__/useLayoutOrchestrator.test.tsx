import React from 'react';
import { renderHook } from '@testing-library/react';
import { useLayoutOrchestrator } from '../useLayoutOrchestrator';

describe('useLayoutOrchestrator', () => {
  it('returns null if no section config is provided', () => {
    const { result } = renderHook(() => useLayoutOrchestrator(<div />, []));
    expect(result.current).toBeNull();
  });

  it('correctly maps fields to sections and moves unassigned fields to Other', () => {
    const FieldA = <div source="a" key="a">A</div>;
    const FieldB = <div source="b" key="b">B</div>;
    const FieldC = <div source="c" key="c">C</div>;
    const GlobalEl = <div key="global">Global</div>;

    const children = [FieldA, FieldB, FieldC, GlobalEl];
    const sections = [{ label: 'Section 1', fields: ['a', 'b'] }];

    const { result } = renderHook(() => useLayoutOrchestrator(children, sections));

    expect(result.current).not.toBeNull();
    const orchestrated = result.current!;
    
    expect(orchestrated).toHaveLength(2);
    
    expect(orchestrated[0].label).toBe('Section 1');
    // The global element should be injected at the top of the first section
    expect(orchestrated[0].elements).toHaveLength(3);
    expect((orchestrated[0].elements[0] as any).key).toBe('.$global');
    expect((orchestrated[0].elements[1] as any).key).toBe('.$a');
    expect((orchestrated[0].elements[2] as any).key).toBe('.$b');

    // Field C should go to Other
    expect(orchestrated[1].label).toBe('Other');
    expect(orchestrated[1].elements).toHaveLength(1);
    expect((orchestrated[1].elements[0] as any).key).toBe('.$c');
  });

  it('preserves field ordering in sections based on the layout config', () => {
    // Config asks for B then A, but children are A then B
    const FieldA = <div source="a" key="a">A</div>;
    const FieldB = <div source="b" key="b">B</div>;

    const children = [FieldA, FieldB];
    const sections = [{ label: 'Reverse', fields: ['b', 'a'] }];

    const { result } = renderHook(() => useLayoutOrchestrator(children, sections));

    expect(result.current).not.toBeNull();
    const orchestrated = result.current!;
    
    expect(orchestrated[0].label).toBe('Reverse');
    expect(orchestrated[0].elements).toHaveLength(2);
    expect((orchestrated[0].elements[0] as any).key).toBe('.$b');
    expect((orchestrated[0].elements[1] as any).key).toBe('.$a');
  });
});
