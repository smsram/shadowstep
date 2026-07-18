import { render, h } from 'preact';
import { App } from './app.tsx';

// Mounts our extension dashboard directly into the native options window framework
const root = document.getElementById('app');
if (root) {
  render(h(App, {}), root);
}