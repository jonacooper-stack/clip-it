import React from 'react';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';
import { fonts } from '@/theme';

let patched = false;

// Set DM Sans as the default font for all Text/TextInput, *behind* any explicit
// styles (so Oswald headings and other overrides still win). Guarded so it
// safely no-ops if React Native's internals ever change shape.
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
