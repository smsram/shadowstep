/**
 * @file main.tsx
 * @description The entry point for the ShadowStep options dashboard.
 * It mounts the Preact application directly into the native options window framework.
 * 
 * @dependencies
 * - Preact (render, h) for DOM rendering.
 * - App Component (app.tsx) as the root node.
 */
import { render, h } from 'preact';
import { App } from './app.tsx';

const root = document.getElementById('app');
if (root) {
  render(h(App, {}), root);
}