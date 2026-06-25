import React from 'react';
import { Platform, Text as RNText, TextInput as RNTextInput } from 'react-native';
import { fonts } from '@/theme';

let applied = false;

// Make DM Sans the default font for any text that doesn't set its own family.
//
// IMPORTANT: on the web we must NOT monkey-patch Text.render and inject a style
// *array* via cloneElement. By the time react-native-web returns that element it
// is already a resolved DOM node, so React tries to assign the array onto the
// element's CSSStyleDeclaration and throws:
//   "Failed to set an indexed property [0] on 'CSSStyleDeclaration'".
// That crash took down every screen after the first text render. On web we set
// the default family with a stylesheet instead; on native the render wrapper is
// safe and lets explicit styles still win.
export function applyGlobalFont(): void {
  if (applied) return;
  applied = true;

  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return;
    const tag = document.createElement('style');
    tag.setAttribute('data-clipit-fonts', '');
    tag.textContent =
      'html,body,input,textarea,button,select,[role="button"]{' +
      `font-family:${fonts.body},-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}`;
    document.head.appendChild(tag);
    return;
  }

  for (const Comp of [RNText, RNTextInput] as any[]) {
    const orig = Comp?.render;
    if (typeof orig !== 'function') continue;
    Comp.render = function renderWithFont(...args: any[]) {
      const el = orig.apply(this, args);
      if (!el) return el;
      return React.cloneElement(el, {
        style: [{ fontFamily: fonts.body }, el.props && el.props.style],
      });
    };
  }
}
