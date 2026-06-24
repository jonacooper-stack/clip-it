import React from 'react';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';
import { fonts } from '@/theme';

let patched = false;

// Make DM Sans the default font for every Text / TextInput, applied *behind* any
// explicit style so Oswald headings still win. Guarded so it safely no-ops if RN's
// internals change shape (e.g. on web).
export function applyGlobalFont(): void {
  if (patched) return;
  patched = true;
  for (const Comp of [RNText, RNTextInput] as any[]) {
    const orig = Comp?.render;
    if (typeof orig !== 'function') continue;
    Comp.render = function patchedRender(...args: any[]) {
      const el = orig.apply(this, args);
      if (!el) return el;
      return React.cloneElement(el, {
        style: [{ fontFamily: fonts.body }, el.props ? el.props.style : undefined],
      });
    };
  }
}
